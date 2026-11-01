import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    method: { type: String, enum: ['online', 'cod'], required: true },
    provider: { type: String, enum: ['razorpay', 'none'], default: 'none' },
    providerOrderId: { type: String },
    providerPaymentId: { type: String },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: [
        'pending',
        'successful',
        'failed',
        'cancelled',
        'cod_pending',
        'cod_collected',
        'refund_pending',
        'refunded',
        'partially_refunded',
      ],
      required: true,
    },
    // Set only after the provider signature was verified server-side.
    verifiedAt: { type: Date },
    verifiedVia: { type: String, enum: ['checkout_signature', 'webhook'] },
    failureReason: { type: String, maxlength: 300 },
    refundedPaise: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ orderId: 1 }, { unique: true });
schema.index({ providerOrderId: 1 }, { unique: true, sparse: true });
schema.index({ providerPaymentId: 1 }, { sparse: true });
schema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Payment', schema);
