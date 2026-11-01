import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 400 },
    data: { type: mongoose.Schema.Types.Mixed },
    readAt: { type: Date },
  },
  { timestamps: true },
);
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, readAt: 1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 });

export default mongoose.model('Notification', schema);
