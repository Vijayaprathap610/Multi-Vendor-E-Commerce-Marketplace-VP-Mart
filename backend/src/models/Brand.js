import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true },
    logoKey: { type: String },
    logoUrl: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
brandSchema.index({ slug: 1 }, { unique: true });
brandSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export default mongoose.model('Brand', brandSchema);
