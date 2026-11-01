import mongoose from 'mongoose';

export const ORDER_STATUSES = [
  'pending_payment',
  'payment_failed',
  'confirmed',
  'cancelled',
  'completed',
];
export const PAYMENT_STATUSES = [
  'pending',
  'successful',
  'failed',
  'cancelled',
  'cod_pending',
  'cod_collected',
  'refund_pending',
  'refunded',
  'partially_refunded',
];

const addressSnap = new mongoose.Schema(
  {
    name: String,
    phone: String,
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderNumber: { type: String, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    paymentMethod: { type: String, enum: ['online', 'cod'], required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, required: true },
    address: { type: addressSnap, required: true },
    couponCode: { type: String },
    couponId: { type: mongoose.Schema.Types.ObjectId },
    // All money in integer paise.
    subtotalPaise: { type: Number, required: true },
    discountPaise: { type: Number, default: 0 },
    shippingPaise: { type: Number, default: 0 },
    taxPaise: { type: Number, default: 0 },
    taxMode: { type: String, enum: ['inclusive', 'exclusive'], required: true },
    totalPaise: { type: Number, required: true },
    refundedPaise: { type: Number, default: 0 },
    cancelReason: { type: String, maxlength: 300 },
    // Unpaid online orders hold stock only until this time.
    expiresAt: { type: Date },
    placedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date },
    fromCart: { type: Boolean, default: false },
  },
  { timestamps: true },
);
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ status: 1, expiresAt: 1 });
orderSchema.index({ createdAt: -1 });

export default mongoose.model('Order', orderSchema);
