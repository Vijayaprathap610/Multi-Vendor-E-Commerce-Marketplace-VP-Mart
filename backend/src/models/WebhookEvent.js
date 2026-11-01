import mongoose from 'mongoose';

// Every provider event is recorded once; replays are recognised by the unique eventId.
const schema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: { type: String },
    result: { type: String, enum: ['applied', 'ignored', 'error'], default: 'applied' },
    detail: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
schema.index({ provider: 1, eventId: 1 }, { unique: true });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 });

export default mongoose.model('WebhookEvent', schema);
