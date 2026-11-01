import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    updatedBy: mongoose.Schema.Types.ObjectId,
  },
  { timestamps: true },
);
schema.index({ key: 1 }, { unique: true });

export default mongoose.model('Setting', schema);
