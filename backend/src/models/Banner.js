import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 240 },
    imageKey: { type: String, required: true },
    imageUrl: { type: String, required: true },
    ctaLabel: { type: String, trim: true, maxlength: 30 },
    // Internal path ("/c/electronics") or an https URL.
    destination: { type: String, required: true, maxlength: 300 },
    kind: { type: String, enum: ['banner', 'festival', 'launch', 'ad'], default: 'banner' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
bannerSchema.index({ isActive: 1, startAt: 1, endAt: 1 });

export default mongoose.model('Banner', bannerSchema);
