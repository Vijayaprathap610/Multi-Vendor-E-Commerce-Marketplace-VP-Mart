import mongoose from 'mongoose';

// A refund is only "processed" after the provider (or, for offline cases, an admin) confirms it.
const schema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderItemId: { type: mongoose.Schema.Types.ObjectId },
    amountPaise: { type: Number, required: true, min: 1 },
    reason: { type: String, maxlength: 300 },
    kind: {
      type: String,
      enum: ['cancellation', 'return', 'late_payment', 'admin'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'processed', 'failed'],
      default: 'pending',
    },
    providerRefundId: { type: String },
    failureReason: { type: String, maxlength: 300 },
    processedAt: { type: Date },
    // Idempotency: one refund per cause (e.g. "cancel:<orderId>").
    key: { type: String, required: true },
  },
  { timestamps: true },
);
schema.index({ key: 1 }, { unique: true });
schema.index({ status: 1, createdAt: -1 });
schema.index({ providerRefundId: 1 }, { sparse: true });

export default mongoose.model('Refund', schema);
