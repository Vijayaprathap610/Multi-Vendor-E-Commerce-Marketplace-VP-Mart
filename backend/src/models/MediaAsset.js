import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    thumbKey: { type: String },
    url: { type: String, required: true },
    thumbUrl: { type: String },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: {
      type: String,
      enum: ['listing', 'logo', 'banner', 'category', 'brand'],
      required: true,
    },
    bytes: { type: Number },
    // Set when a resource references the image; unattached uploads are purged by the cleanup job.
    attachedAt: { type: Date },
  },
  { timestamps: true },
);
mediaSchema.index({ key: 1 }, { unique: true });
mediaSchema.index({ attachedAt: 1, createdAt: 1 });

export default mongoose.model('MediaAsset', mediaSchema);
