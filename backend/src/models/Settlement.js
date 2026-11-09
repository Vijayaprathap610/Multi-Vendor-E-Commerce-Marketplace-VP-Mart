import mongoose from 'mongoose';

export const SETTLEMENT_STATUSES = ['pending', 'processing', 'completed', 'failed'];

const schema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    vendorName: String,
    settlementNumber: { type: String, required: true, unique: true },
    amountPaise: { type: Number, required: true },
    periodStart: Date,
    periodEnd: Date,
    status: { type: String, enum: SETTLEMENT_STATUSES, default: 'pending', index: true },
    bankAccountMasked: String,
    payoutReference: String,
    processedAt: Date,
    notes: String,
    ledgerEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' }],
  },
  { timestamps: true },
);

schema.index({ vendorId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Settlement', schema);
