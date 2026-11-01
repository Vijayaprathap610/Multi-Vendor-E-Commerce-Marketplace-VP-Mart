import mongoose from 'mongoose';

// reserved -> redeemed (order confirmed/paid) or released (payment failed, order cancelled/expired).
const schema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', required: true },
    code: { type: String, required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    discountPaise: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['reserved', 'redeemed', 'released'], default: 'reserved' },
  },
  { timestamps: true },
);
// One redemption record per order, which also makes reserve/redeem/release idempotent.
schema.index({ orderId: 1 }, { unique: true });
schema.index({ couponId: 1, buyerId: 1, status: 1 });

export default mongoose.model('CouponRedemption', schema);
