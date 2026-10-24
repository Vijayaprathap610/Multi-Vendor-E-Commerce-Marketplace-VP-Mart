import Listing from '../models/Listing.js';
import { notFound } from '../utils/AppError.js';
import { escapeRegex } from '../utils/text.js';
import { audit } from '../services/auditService.js';
import { catalogChanged } from '../services/cache.js';
import { createListing, updateListing } from '../services/listingService.js';
import {
  getProfile,
  missingForSubmission,
  submitProfile,
  upsertProfile,
} from '../services/vendorService.js';

const profileView = (p) =>
  p && {
    ...p.toObject(),
    payout: p.payout
      ? {
          accountHolder: p.payout.accountHolder,
          ifsc: p.payout.ifsc,
          accountMasked: p.payout.accountLast4 ? `••••${p.payout.accountLast4}` : null,
        }
      : null,
  };

export async function getMyProfile(req, res) {
  const p = await getProfile(req.user._id);
  res.json({ profile: profileView(p), missing: missingForSubmission(p), status: req.user.status });
}
export async function saveMyProfile(req, res) {
  const p = await upsertProfile(req.user, req.valid.body);
  await audit(req, 'vendor.profile_saved', { target: { type: 'VendorProfile', id: p._id } });
  res.json({ profile: profileView(p), missing: missingForSubmission(p) });
}
export async function submitMyProfile(req, res) {
  const p = await submitProfile(req.user);
  await audit(req, 'vendor.profile_submitted', { target: { type: 'VendorProfile', id: p._id } });
  res.json({ profile: profileView(p) });
}

export async function summary(req, res) {
  const [row] = await Listing.aggregate([
    { $match: { vendorId: req.user._id } },
    {
      $group: {
        _id: null,
        listings: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
        hidden: { $sum: { $cond: [{ $eq: ['$status', 'hidden'] }, 1, 0] } },
        outOfStock: {
          $sum: { $cond: [{ $or: ['$manualOutOfStock', { $lte: ['$stock', 0] }] }, 1, 0] },
        },
        stockUnits: { $sum: '$stock' },
        unitsSold: { $sum: '$soldCount' },
      },
    },
  ]);
  res.json({
    summary: row
      ? { ...row, _id: undefined }
      : {
          listings: 0,
          active: 0,
          inactive: 0,
          hidden: 0,
          outOfStock: 0,
          stockUnits: 0,
          unitsSold: 0,
        },
  });
}

const mine = (l) => ({
  id: String(l._id),
  productId: String(l.productId),
  sku: l.sku,
  variant: l.variant,
  title: l.title,
  description: l.description,
  brandName: l.brandName,
  categoryName: l.categoryName,
  pricePaise: l.pricePaise,
  mrpPaise: l.mrpPaise,
  stock: l.stock,
  soldCount: l.soldCount,
  status: l.status,
  hiddenReason: l.hiddenReason,
  manualOutOfStock: l.manualOutOfStock,
  outOfStock: l.manualOutOfStock || l.stock <= 0,
  isPublic: l.isPublic,
  images: l.images,
  prescriptionRequired: l.prescriptionRequired,
  expiryDate: l.expiryDate,
  attributes: l.attributes,
  updatedAt: l.updatedAt,
});

export async function listMine(req, res) {
  const { q, status, stock, page, limit } = req.valid.query;
  const filter = { vendorId: req.user._id };
  if (status) filter.status = status;
  if (stock === 'out') filter.$or = [{ manualOutOfStock: true }, { stock: { $lte: 0 } }];
  if (q) filter.title = new RegExp(escapeRegex(q), 'i');
  const [items, total] = await Promise.all([
    Listing.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Listing.countDocuments(filter),
  ]);
  res.json({ items: items.map(mine), total, page, pages: Math.ceil(total / limit) });
}

export async function getMine(req, res) {
  const l = await Listing.findOne({ _id: req.valid.params.id, vendorId: req.user._id }).lean();
  if (!l) throw notFound('Listing not found');
  res.json({ listing: mine(l) });
}

export async function create(req, res) {
  const l = await createListing(req.user, req.valid.body);
  await audit(req, 'listing.created', { target: { type: 'Listing', id: l._id } });
  res.status(201).json({ listing: mine(l) });
}

export async function update(req, res) {
  const l = await updateListing(req.user, req.valid.params.id, req.valid.body);
  await audit(req, 'listing.updated', {
    target: { type: 'Listing', id: l._id },
    metadata: { fields: Object.keys(req.valid.body) },
  });
  res.json({ listing: mine(l) });
}

// "Delete" for a vendor means stop selling. The record stays so past orders, payments and
// ledger entries keep a valid reference.
export async function stopSelling(req, res) {
  const l = await Listing.findOne({ _id: req.valid.params.id, vendorId: req.user._id });
  if (!l) throw notFound('Listing not found');
  if (l.status === 'active') {
    l.status = 'inactive';
    l.isPublic = false;
    await l.save();
    await catalogChanged();
    await audit(req, 'listing.deactivated', { target: { type: 'Listing', id: l._id } });
  }
  res.json({ listing: mine(l) });
}
