import mongoose from 'mongoose';
import User from '../models/User.js';
import VendorProfile from '../models/VendorProfile.js';
import Listing from '../models/Listing.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Shipment from '../models/Shipment.js';
import Refund from '../models/Refund.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Settlement from '../models/Settlement.js';
import AuditLog from '../models/AuditLog.js';
import { AppError } from '../utils/AppError.js';

// Safe vendor deletion with complete integrity verification
export async function deleteVendorWithSafeguards(req, res, next) {
  try {
    const vendorId = req.params.id;
    const vendor = await User.findOne({ _id: vendorId, role: 'vendor' });
    if (!vendor) throw new AppError(404, 'NOT_FOUND', 'Vendor not found');

    const blockers = [];

    // 1. Check for active shipments (in packing, pickup, transit)
    const activeShipments = await Shipment.countDocuments({
      vendorId: vendor._id,
      status: { $in: ['confirmed', 'packing', 'packed', 'pickup_requested', 'assigned', 'picked_up', 'out_for_delivery'] },
    });
    if (activeShipments > 0) {
      blockers.push(`Vendor has ${activeShipments} active shipment(s) in progress.`);
    }

    // 2. Check for pending refunds
    const pendingRefunds = await Refund.countDocuments({
      vendorId: vendor._id,
      status: 'pending',
    });
    if (pendingRefunds > 0) {
      blockers.push(`Vendor has ${pendingRefunds} pending refund(s) awaiting resolution.`);
    }

    // 3. Check for unsettled payable funds in ledger
    const payableEntries = await LedgerEntry.find({
      vendorId: vendor._id,
      status: 'payable',
    });
    const payableTotalPaise = payableEntries.reduce((sum, e) => sum + e.amountPaise, 0);
    if (payableTotalPaise > 0) {
      blockers.push(`Vendor has outstanding unpaid settlement balance of ₹${(payableTotalPaise / 100).toFixed(2)}.`);
    }

    // If any blocker is found, reject deletion to protect transaction integrity
    if (blockers.length > 0) {
      return res.status(409).json({
        error: {
          code: 'VENDOR_DELETION_BLOCKED',
          message: 'Cannot delete vendor due to active business and legal obligations.',
          safeguards: blockers,
        },
      });
    }

    // If safe, execute safe deletion:
    // Deactivate all listings
    await Listing.updateMany(
      { vendorId: vendor._id },
      { $set: { status: 'inactive', vendorActive: false } },
    );

    // Update vendor profile to closed
    await VendorProfile.updateOne(
      { userId: vendor._id },
      { $set: { status: 'rejected', suspendedReason: 'Account closed by admin' } },
    );

    // Anonymize personal details while preserving transaction history
    vendor.status = 'deleted';
    vendor.email = `deleted_${vendor._id}@anonymized.vpmart.internal`;
    vendor.phone = '';
    vendor.name = `Closed Vendor (${vendor._id.toString().slice(-4)})`;
    vendor.deletedAt = new Date();
    await vendor.save();

    // Audit log
    await AuditLog.create({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: 'vendor_deleted',
      targetType: 'vendor',
      targetId: String(vendor._id),
      metadata: { admin: req.user.email, reason: req.body?.reason || 'Admin deleted vendor after safeguards passed' },
    });

    res.json({
      message: 'Vendor safely decommissioned and archived. Financial and transactional integrity preserved.',
      vendorId: vendor._id,
    });
  } catch (err) {
    next(err);
  }
}

// Financial and revenue reports
export async function getRevenueReports(req, res, next) {
  try {
    // 1. Overall totals from confirmed/completed orders
    const summary = await Order.aggregate([
      { $match: { status: { $in: ['confirmed', 'completed'] } } },
      {
        $group: {
          _id: null,
          grossSalesPaise: { $sum: '$subtotalPaise' },
          totalShippingPaise: { $sum: '$shippingPaise' },
          totalTaxPaise: { $sum: '$taxPaise' },
          totalDiscountsPaise: { $sum: '$discountPaise' },
          totalRefundedPaise: { $sum: '$refundedPaise' },
          netPayablePaise: { $sum: '$totalPaise' },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    // 2. Commission totals from ledger
    const ledgerStats = await LedgerEntry.aggregate([
      {
        $group: {
          _id: '$kind',
          totalPaise: { $sum: '$amountPaise' },
        },
      },
    ]);

    const ledgerMap = {};
    for (const item of ledgerStats) {
      ledgerMap[item._id] = item.totalPaise;
    }

    // 3. Category-wise sales
    const categorySales = await OrderItem.aggregate([
      {
        $group: {
          _id: '$categoryName',
          totalPaise: { $sum: '$totalPaise' },
          unitsSold: { $sum: '$quantity' },
        },
      },
      { $sort: { totalPaise: -1 } },
      { $limit: 10 },
    ]);

    // 4. Vendor-wise sales
    const vendorSales = await OrderItem.aggregate([
      {
        $group: {
          _id: { vendorId: '$vendorId', vendorName: '$vendorName' },
          grossSalesPaise: { $sum: '$totalPaise' },
          unitsSold: { $sum: '$quantity' },
        },
      },
      { $sort: { grossSalesPaise: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      totals: summary[0] || {
        grossSalesPaise: 0,
        totalShippingPaise: 0,
        totalTaxPaise: 0,
        totalDiscountsPaise: 0,
        totalRefundedPaise: 0,
        netPayablePaise: 0,
        orderCount: 0,
      },
      commission: {
        platformCommissionPaise: ledgerMap.commission || 0,
        vendorSharePaise: ledgerMap.vendor_share || 0,
        refundedCommissionPaise: ledgerMap.refund_commission || 0,
      },
      categorySales: categorySales.map((c) => ({
        category: c._id || 'General',
        totalPaise: c.totalPaise,
        unitsSold: c.unitsSold,
      })),
      vendorSales: vendorSales.map((v) => ({
        vendorId: v._id.vendorId,
        vendorName: v._id.vendorName || 'Vendor',
        grossSalesPaise: v.grossSalesPaise,
        unitsSold: v.unitsSold,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// Settlements list
export async function listSettlements(req, res, next) {
  try {
    const filter = {};
    if (req.user.role === 'vendor') {
      filter.vendorId = req.user._id;
    } else if (req.query.vendorId) {
      filter.vendorId = req.query.vendorId;
    }

    const items = await Settlement.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

// Create settlement payout (Admin)
export async function createSettlement(req, res, next) {
  try {
    const { vendorId, notes } = req.body;
    const vendor = await User.findById(vendorId);
    if (!vendor) throw new AppError(404, 'NOT_FOUND', 'Vendor not found');

    const profile = await VendorProfile.findOne({ userId: vendor._id });

    // Find all payable entries
    const payableEntries = await LedgerEntry.find({
      vendorId: vendor._id,
      kind: 'vendor_share',
      status: 'payable',
    });

    if (payableEntries.length === 0) {
      throw new AppError(400, 'NO_PAYABLE_FUNDS', 'No payable funds found for this vendor.');
    }

    const totalPaise = payableEntries.reduce((sum, e) => sum + e.amountPaise, 0);
    const entryIds = payableEntries.map((e) => e._id);

    const settlementNumber = `SET-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const settlement = await Settlement.create({
      vendorId: vendor._id,
      vendorName: profile?.shopName || vendor.name,
      settlementNumber,
      amountPaise: totalPaise,
      status: 'completed',
      bankAccountMasked: profile?.bankDetails?.accountNumber
        ? `****${profile.bankDetails.accountNumber.slice(-4)}`
        : '****1234',
      payoutReference: `PAY-${Date.now()}`,
      processedAt: new Date(),
      notes: notes || 'Marketplace settlement payout',
      ledgerEntryIds: entryIds,
    });

    // Mark entries as settled
    await LedgerEntry.updateMany(
      { _id: { $in: entryIds } },
      { $set: { status: 'settled', settlementId: settlement._id } },
    );

    res.status(201).json({
      message: 'Settlement processed successfully',
      settlement,
    });
  } catch (err) {
    next(err);
  }
}
