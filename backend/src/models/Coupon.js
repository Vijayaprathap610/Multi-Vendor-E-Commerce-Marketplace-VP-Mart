import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    title: { type: String, trim: true, maxlength: 100 },
    discountType: { type: String, enum: ['fixed', 'percent'], required: true },
    // fixed: paise off. percent: whole percent (1-100).
    value: { type: Number, required: true, min: 1 },
    minPurchasePaise: { type: Number, default: 0, min: 0 },
    maxDiscountPaise: { type: Number, min: 1 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    // A coupon applies only to the listed unique products, unless appliesToAll is set explicitly.
    appliesToAll: { type: Boolean, default: false },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    // Who may use it: everyone, specific buyers, or buyers with no previous order.
    eligibility: {
      mode: { type: String, enum: ['all', 'buyers', 'new_buyers'], default: 'all' },
      buyerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    usageLimit: { type: Number, min: 1 },
    perBuyerLimit: { type: Number, min: 1, default: 1 },
    // reservedCount: held by unpaid orders. usedCount: confirmed redemptions only.
    reservedCount: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    isPublic: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, isPublic: 1, validTo: 1 });
couponSchema.index({ productIds: 1 });

export default mongoose.model('Coupon', couponSchema);
