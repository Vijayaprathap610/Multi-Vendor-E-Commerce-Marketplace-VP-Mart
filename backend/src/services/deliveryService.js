import crypto from 'node:crypto';
import mongoose from 'mongoose';
import env from '../config/env.js';
import Shipment from '../models/Shipment.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import User from '../models/User.js';
import VendorProfile from '../models/VendorProfile.js';
import DeliveryAgentProfile from '../models/DeliveryAgentProfile.js';
import LedgerEntry from '../models/LedgerEntry.js';
import Notification from '../models/Notification.js';
import { AppError } from '../utils/AppError.js';
import { emitToRole, emitToUser, emitToOrder } from '../sockets/socket.js';

// Delivery fee earned by agent per successful delivery (in paise): ₹50 = 5000 paise
export const AGENT_DELIVERY_FEE_PAISE = 5000;
// Milestone incentive: 5 deliveries in a day = ₹200 bonus
export const INCENTIVE_TARGET_DELIVERIES = 5;
export const INCENTIVE_BONUS_PAISE = 20000;

export function hashOtp(otp) {
  return crypto.createHmac('sha256', env.JWT_ACCESS_SECRET || 'vpmart_otp_secret').update(String(otp)).digest('hex');
}

export function generateDeliveryOtp() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hash = hashOtp(otp);
  return { otp, hash };
}

// Vendor requests delivery pickup after packing
export async function requestPickup(vendorUser, shipmentId) {
  const shipment = await Shipment.findOne({ _id: shipmentId, vendorId: vendorUser._id });
  if (!shipment) throw new AppError(404, 'NOT_FOUND', 'Shipment not found');

  if (shipment.status !== 'packed' && shipment.status !== 'packing' && shipment.status !== 'confirmed') {
    throw new AppError(400, 'INVALID_STATE', `Cannot request pickup for shipment in '${shipment.status}' status. Order must be packed.`);
  }

  const vendorProfile = await VendorProfile.findOne({ userId: vendorUser._id });
  const order = await Order.findById(shipment.orderId);

  // Snapshot pickup and destination addresses if not already set
  shipment.pickupAddress = {
    shopName: vendorProfile?.shopName || vendorUser.name,
    address: vendorProfile?.pickupAddress?.line1 || vendorProfile?.pickupAddress?.address || 'Vendor Warehouse',
    city: vendorProfile?.pickupAddress?.city || 'Chennai',
    state: vendorProfile?.pickupAddress?.state || 'Tamil Nadu',
    pincode: vendorProfile?.pickupAddress?.pincode || '600001',
    phone: vendorProfile?.pickupAddress?.phone || vendorUser.phone || '',
  };

  if (order?.address) {
    shipment.destinationAddress = {
      name: order.address.name,
      phone: order.address.phone,
      line1: order.address.line1,
      line2: order.address.line2 || '',
      city: order.address.city,
      state: order.address.state,
      pincode: order.address.pincode,
    };
  }

  // Pre-generate OTP for buyer
  const { otp, hash } = generateDeliveryOtp();
  shipment.deliveryOtpHash = hash;
  shipment.deliveryOtpExpiresAt = new Date(Date.now() + 48 * 3600 * 1000);
  shipment.deliveryOtpAttempts = 0;

  if (order?.paymentMethod === 'cod' && order?.paymentStatus === 'cod_pending') {
    shipment.codAmountDuePaise = shipment.subtotalPaise + (shipment.shippingPaise || 0) - (shipment.discountPaise || 0);
  } else {
    shipment.codAmountDuePaise = 0;
  }

  shipment.status = 'pickup_requested';
  shipment.timeline.push({
    status: 'pickup_requested',
    by: vendorUser._id,
    note: 'Vendor packed order and requested delivery agent pickup',
    at: new Date(),
  });
  await shipment.save();

  // Notify buyer with their delivery OTP
  await Notification.create({
    userId: shipment.buyerId,
    type: 'delivery_otp',
    title: 'Order Ready for Dispatch',
    body: `Your package from ${shipment.vendorName || 'VP Mart'} is ready. Your delivery OTP is ${otp}. Share it only when you receive your package.`,
    data: { orderId: String(shipment.orderId), shipmentId: String(shipment._id), otp },
  });
  emitToUser(String(shipment.buyerId), 'notification:new', {
    title: 'Order Ready for Dispatch',
    message: `Your package from ${shipment.vendorName || 'VP Mart'} is ready. Delivery OTP: ${otp}`,
  });

  // Broadcast to all active delivery agents
  emitToRole('delivery_agent', 'pickup:requested', {
    shipmentId: String(shipment._id),
    orderId: String(shipment.orderId),
    vendorName: shipment.pickupAddress?.shopName,
    pickupCity: shipment.pickupAddress?.city,
    pickupPincode: shipment.pickupAddress?.pincode,
    destinationCity: shipment.destinationAddress?.city,
    destinationPincode: shipment.destinationAddress?.pincode,
    codAmountDuePaise: shipment.codAmountDuePaise,
  });

  return { shipment, plainOtp: otp };
}

// Delivery Agent accepts pickup (atomic first-accept lock)
export async function acceptPickup(agentUser, shipmentId) {
  const updated = await Shipment.findOneAndUpdate(
    {
      _id: shipmentId,
      status: 'pickup_requested',
    },
    {
      $set: {
        status: 'assigned',
        deliveryAgentId: agentUser._id,
        deliveryAgentName: agentUser.name,
        assignedAt: new Date(),
      },
      $push: {
        timeline: {
          status: 'assigned',
          by: agentUser._id,
          note: `Delivery assigned to agent ${agentUser.name}`,
          at: new Date(),
        },
      },
    },
    { new: true },
  );

  if (!updated) {
    const existing = await Shipment.findById(shipmentId);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Shipment not found');
    throw new AppError(409, 'ALREADY_ASSIGNED', 'This pickup request has already been accepted by another delivery agent.');
  }

  // Notify vendor and buyer
  emitToUser(String(updated.vendorId), 'pickup:accepted', {
    shipmentId: String(updated._id),
    agentName: agentUser.name,
    agentPhone: agentUser.phone,
  });
  emitToUser(String(updated.buyerId), 'order:status_changed', {
    orderId: String(updated.orderId),
    status: 'assigned',
    agentName: agentUser.name,
  });
  emitToOrder(String(updated.orderId), 'order:update', { status: 'assigned' });

  return sanitizeForAgent(updated);
}

// Mark picked up from vendor
export async function pickupFromVendor(agentUser, shipmentId) {
  const shipment = await Shipment.findOne({ _id: shipmentId, deliveryAgentId: agentUser._id });
  if (!shipment) throw new AppError(404, 'NOT_FOUND', 'Assigned shipment not found');

  if (shipment.status !== 'assigned') {
    throw new AppError(400, 'INVALID_STATE', `Cannot pick up shipment in status '${shipment.status}'`);
  }

  shipment.status = 'out_for_delivery';
  shipment.pickedUpAt = new Date();
  shipment.timeline.push({
    status: 'out_for_delivery',
    by: agentUser._id,
    note: 'Package collected from vendor. Out for delivery.',
    at: new Date(),
  });
  await shipment.save();

  emitToUser(String(shipment.buyerId), 'order:status_changed', {
    orderId: String(shipment.orderId),
    status: 'out_for_delivery',
  });
  emitToOrder(String(shipment.orderId), 'order:update', { status: 'out_for_delivery' });

  return sanitizeForAgent(shipment);
}

// Verify delivery OTP & complete delivery
export async function verifyDeliveryOtp(agentUser, shipmentId, enteredOtp) {
  const shipment = await Shipment.findOne({ _id: shipmentId, deliveryAgentId: agentUser._id });
  if (!shipment) throw new AppError(404, 'NOT_FOUND', 'Assigned shipment not found');

  if (shipment.status !== 'out_for_delivery' && shipment.status !== 'assigned') {
    throw new AppError(400, 'INVALID_STATE', `Shipment is in status '${shipment.status}', not out for delivery`);
  }

  if (shipment.deliveryOtpAttempts >= 5) {
    throw new AppError(429, 'OTP_LOCKED', 'Too many incorrect OTP attempts. Please contact support.');
  }

  if (shipment.deliveryOtpExpiresAt && shipment.deliveryOtpExpiresAt < new Date()) {
    throw new AppError(400, 'OTP_EXPIRED', 'Delivery OTP has expired.');
  }

  const expectedHash = shipment.deliveryOtpHash;
  const actualHash = hashOtp(enteredOtp);

  if (!crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash))) {
    shipment.deliveryOtpAttempts += 1;
    await shipment.save();
    throw new AppError(400, 'INVALID_OTP', `Incorrect OTP. ${5 - shipment.deliveryOtpAttempts} attempts remaining.`);
  }

  // OTP verified successfully!
  shipment.status = 'delivered';
  shipment.deliveredAt = new Date();

  // If COD, mark collected
  if (shipment.codAmountDuePaise > 0) {
    shipment.codCollected = true;
    shipment.codCollectedAt = new Date();

    await Order.updateOne(
      { _id: shipment.orderId },
      { $set: { paymentStatus: 'cod_collected' } },
    );
  }

  shipment.timeline.push({
    status: 'delivered',
    by: agentUser._id,
    note: 'Package delivered successfully. OTP verified.',
    at: new Date(),
  });
  await shipment.save();

  // Update Delivery Agent stats and earnings
  await DeliveryAgentProfile.findOneAndUpdate(
    { userId: agentUser._id },
    {
      $inc: {
        completedDeliveries: 1,
        earningsPaise: AGENT_DELIVERY_FEE_PAISE,
      },
    },
    { upsert: true, new: true },
  );

  // Check if all shipments in order are delivered
  const remaining = await Shipment.countDocuments({
    orderId: shipment.orderId,
    status: { $nin: ['delivered', 'cancelled', 'returned'] },
  });

  if (remaining === 0) {
    await Order.updateOne(
      { _id: shipment.orderId },
      { $set: { status: 'completed' } },
    );
  }

  // Real-time notifications
  emitToUser(String(shipment.buyerId), 'order:status_changed', {
    orderId: String(shipment.orderId),
    status: 'delivered',
  });
  emitToUser(String(shipment.vendorId), 'order:status_changed', {
    orderId: String(shipment.orderId),
    status: 'delivered',
  });
  emitToOrder(String(shipment.orderId), 'order:update', { status: 'delivered' });

  return sanitizeForAgent(shipment);
}

// Report failed delivery
export async function reportFailedDelivery(agentUser, shipmentId, { reason, rescheduleDate }) {
  const shipment = await Shipment.findOne({ _id: shipmentId, deliveryAgentId: agentUser._id });
  if (!shipment) throw new AppError(404, 'NOT_FOUND', 'Assigned shipment not found');

  shipment.status = 'failed_delivery';
  shipment.failedReason = reason || 'Customer unavailable';
  if (rescheduleDate) {
    shipment.rescheduledDate = rescheduleDate;
  }
  shipment.timeline.push({
    status: 'failed_delivery',
    by: agentUser._id,
    note: `Delivery attempt failed: ${shipment.failedReason}${rescheduleDate ? `. Rescheduled for ${rescheduleDate}` : ''}`,
    at: new Date(),
  });
  await shipment.save();

  emitToUser(String(shipment.buyerId), 'order:status_changed', {
    orderId: String(shipment.orderId),
    status: 'failed_delivery',
    reason: shipment.failedReason,
  });

  return sanitizeForAgent(shipment);
}

// Return to vendor workflow
export async function returnToVendor(agentUser, shipmentId, reason) {
  const shipment = await Shipment.findOne({ _id: shipmentId, deliveryAgentId: agentUser._id });
  if (!shipment) throw new AppError(404, 'NOT_FOUND', 'Assigned shipment not found');

  shipment.status = 'returned';
  shipment.timeline.push({
    status: 'returned',
    by: agentUser._id,
    note: `Package returned to vendor. Reason: ${reason || 'Failed delivery return'}`,
    at: new Date(),
  });
  await shipment.save();

  emitToUser(String(shipment.vendorId), 'order:status_changed', {
    orderId: String(shipment.orderId),
    status: 'returned',
  });

  return sanitizeForAgent(shipment);
}

// List available pickup requests
export async function listAvailablePickups() {
  const shipments = await Shipment.find({ status: 'pickup_requested' })
    .sort({ createdAt: -1 })
    .lean();

  return shipments.map((s) => ({
    id: String(s._id),
    orderId: String(s.orderId),
    vendorName: s.pickupAddress?.shopName || s.vendorName,
    pickupAddress: s.pickupAddress,
    destinationSummary: {
      city: s.destinationAddress?.city,
      state: s.destinationAddress?.state,
      pincode: s.destinationAddress?.pincode,
    },
    codAmountDuePaise: s.codAmountDuePaise || 0,
    subtotalPaise: s.subtotalPaise,
    createdAt: s.createdAt,
  }));
}

// List agent's deliveries
export async function listAgentDeliveries(agentUser, query = {}) {
  const filter = { deliveryAgentId: agentUser._id };
  if (query.status) {
    if (query.status === 'active') {
      filter.status = { $in: ['assigned', 'picked_up', 'out_for_delivery'] };
    } else if (query.status === 'completed') {
      filter.status = 'delivered';
    } else {
      filter.status = query.status;
    }
  }

  const shipments = await Shipment.find(filter).sort({ updatedAt: -1 }).lean();
  return shipments.map(sanitizeForAgent);
}

// Agent earnings and incentive report
export async function getAgentEarnings(agentUser) {
  let profile = await DeliveryAgentProfile.findOne({ userId: agentUser._id }).lean();
  if (!profile) {
    profile = {
      completedDeliveries: 0,
      earningsPaise: 0,
      incentivesPaise: 0,
    };
  }

  // Count today's completed deliveries
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startOfWeek = new Date();
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  startOfWeek.setHours(0, 0, 0, 0);

  const [todayCount, weekCount, recentDeliveries] = await Promise.all([
    Shipment.countDocuments({
      deliveryAgentId: agentUser._id,
      status: 'delivered',
      deliveredAt: { $gte: startOfDay },
    }),
    Shipment.countDocuments({
      deliveryAgentId: agentUser._id,
      status: 'delivered',
      deliveredAt: { $gte: startOfWeek },
    }),
    Shipment.find({
      deliveryAgentId: agentUser._id,
      status: 'delivered',
    })
      .sort({ deliveredAt: -1 })
      .limit(10)
      .lean(),
  ]);

  const todayEarningsPaise = todayCount * AGENT_DELIVERY_FEE_PAISE;
  const weekEarningsPaise = weekCount * AGENT_DELIVERY_FEE_PAISE;
  const incentiveEligible = todayCount >= INCENTIVE_TARGET_DELIVERIES;
  const totalEarnedPaise = profile.earningsPaise + profile.incentivesPaise;

  const recent = recentDeliveries.map((d) => ({
    id: String(d._id),
    destinationAddress: d.destinationAddress,
    deliveredAt: d.deliveredAt,
    earningPaise: AGENT_DELIVERY_FEE_PAISE,
  }));

  return {
    completedDeliveries: profile.completedDeliveries,
    totalEarningsPaise: totalEarnedPaise,
    baseEarningsPaise: profile.earningsPaise,
    incentivesPaise: profile.incentivesPaise,
    total: {
      deliveries: profile.completedDeliveries,
      earningsPaise: totalEarnedPaise,
    },
    today: {
      deliveries: todayCount,
      earningsPaise: todayEarningsPaise,
      targetDeliveries: INCENTIVE_TARGET_DELIVERIES,
      targetBonusPaise: INCENTIVE_BONUS_PAISE,
      eligibleForBonus: incentiveEligible,
      progressPercent: Math.min(100, Math.round((todayCount / INCENTIVE_TARGET_DELIVERIES) * 100)),
    },
    week: {
      deliveries: weekCount,
      earningsPaise: weekEarningsPaise,
    },
    recent,
    incentive: {
      target: INCENTIVE_TARGET_DELIVERIES,
      progress: todayCount,
      bonusPaise: INCENTIVE_BONUS_PAISE,
    },
  };
}

// Mask customer phone unless within 12 hours of delivery or out for delivery
function sanitizeForAgent(shipment) {
  const json = shipment.toObject ? shipment.toObject() : { ...shipment };
  delete json.deliveryOtpHash; // NEVER expose OTP hash to delivery agent!

  const isOutForDelivery = json.status === 'out_for_delivery' || json.status === 'delivered';
  if (!isOutForDelivery && json.destinationAddress?.phone) {
    const p = json.destinationAddress.phone;
    json.destinationAddress.phone = p.length >= 4 ? `${p.slice(0, 2)}******${p.slice(-2)}` : '******';
  }

  json.id = String(json._id);
  return json;
}
