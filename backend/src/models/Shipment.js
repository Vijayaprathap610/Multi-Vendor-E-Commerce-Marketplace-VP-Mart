import mongoose from 'mongoose';

export const SHIPMENT_STATUSES = [
  'pending_payment',
  'confirmed',
  'packing',
  'packed',
  'pickup_requested',
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'returning',
  'returned',
  'cancelled',
];

// One shipment per vendor per order, each with its own estimate, status and timeline.
const schema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vendorName: String,
    status: { type: String, enum: SHIPMENT_STATUSES, required: true },
    subtotalPaise: { type: Number, required: true },
    discountPaise: { type: Number, default: 0 },
    shippingPaise: { type: Number, default: 0 },
    estimate: { dispatchDate: String, earliest: String, latest: String, zone: String },
    deliveryAgentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    deliveryAgentName: String,
    assignedAt: Date,
    pickedUpAt: Date,
    deliveredAt: Date,
    deliveryOtpHash: String,
    deliveryOtpExpiresAt: Date,
    deliveryOtpAttempts: { type: Number, default: 0 },
    codAmountDuePaise: { type: Number, default: 0 },
    codCollected: { type: Boolean, default: false },
    codCollectedAt: Date,
    failedReason: String,
    rescheduledDate: String,
    pickupAddress: {
      shopName: String,
      address: String,
      city: String,
      state: String,
      pincode: String,
      phone: String,
    },
    destinationAddress: {
      name: String,
      phone: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
    },
    timeline: [
      {
        _id: false,
        status: String,
        at: { type: Date, default: Date.now },
        by: mongoose.Schema.Types.ObjectId,
        note: String,
      },
    ],
  },
  { timestamps: true },
);
schema.index({ vendorId: 1, status: 1, createdAt: -1 });
schema.index({ buyerId: 1, createdAt: -1 });

export default mongoose.model('Shipment', schema);
