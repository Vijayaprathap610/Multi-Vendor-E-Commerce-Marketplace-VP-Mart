import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    description: { type: String, trim: true, maxlength: 300 },
    imageKey: { type: String },
    imageUrl: { type: String },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    // Sub-categories use 'inherit' to follow their parent. 'food' and 'medicine' require the vendor to hold the relevant licence on file.
    regulation: { type: String, enum: ['none', 'food', 'medicine', 'inherit'], default: 'none' },
    // Only categories with deviceFields accept model/version/deviceType on products.
    deviceFields: { type: Boolean, default: false },
    gstPercent: { type: Number, min: 0, max: 40, default: 18 },
    // Cold-chain / bulky handling for delivery estimates.
    shipping: {
      maxZone: {
        type: String,
        enum: ['local', 'circle', 'region', 'national'],
        default: 'national',
      },
      extraDays: { type: Number, min: 0, max: 14, default: 0 },
    },
  },
  { timestamps: true },
);
categorySchema.index({ slug: 1 }, { unique: true });
categorySchema.index({ parent: 1, sortOrder: 1 });

export default mongoose.model('Category', categorySchema);
