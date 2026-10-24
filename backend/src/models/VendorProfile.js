import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    pincode: { type: String, match: /^[1-9][0-9]{5}$/ },
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 },
  },
  { _id: false },
);

const vendorProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shopName: { type: String, trim: true, maxlength: 80 },
    slug: { type: String, lowercase: true },
    description: { type: String, trim: true, maxlength: 1000 },
    logoKey: { type: String },
    logoUrl: { type: String },
    businessName: { type: String, trim: true, maxlength: 120 },
    gstin: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    },
    // Licences required to sell regulated categories.
    fssaiLicense: { type: String, trim: true, maxlength: 20 },
    drugLicense: { type: String, trim: true, maxlength: 40 },
    pickupAddress: { type: addressSchema, default: () => ({}) },
    // Only masked bank details are stored. Full account numbers belong with the payment provider.
    payout: {
      accountHolder: { type: String, trim: true, maxlength: 80 },
      accountLast4: { type: String, match: /^[0-9]{4}$/ },
      ifsc: { type: String, trim: true, uppercase: true, match: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
    },
    delivery: {
      processingDays: { type: Number, min: 0, max: 14, default: 1 },
      dispatchCutoffHour: { type: Number, min: 0, max: 23, default: 16 },
      shippingChargePaise: { type: Number, min: 0, default: 0 },
      freeShippingAbovePaise: { type: Number, min: 0 },
      coverage: {
        mode: { type: String, enum: ['all', 'prefixes'], default: 'all' },
        pincodePrefixes: [{ type: String, match: /^[1-9][0-9]{0,5}$/ }],
      },
      // 0 = Sunday ... 6 = Saturday: days the vendor does not dispatch.
      closedWeekdays: [{ type: Number, min: 0, max: 6 }],
      unavailableUntil: { type: Date },
    },
    submittedAt: { type: Date },
    reviewNote: { type: String, maxlength: 300 },
    warnings: [
      {
        message: String,
        at: { type: Date, default: Date.now },
        by: mongoose.Schema.Types.ObjectId,
      },
    ],
  },
  { timestamps: true },
);
vendorProfileSchema.index({ userId: 1 }, { unique: true });
vendorProfileSchema.index({ slug: 1 }, { unique: true, sparse: true });

export default mongoose.model('VendorProfile', vendorProfileSchema);
