import mongoose from 'mongoose';

// Append-only money ledger. `key` is unique, so retries and duplicate webhooks can never create
// the same entry twice. Amounts are signed integer paise (refunds are negative).
export const LEDGER_KINDS = [
  'sale',
  'commission',
  'vendor_share',
  'shipping',
  'refund_sale',
  'refund_commission',
  'refund_vendor_share',
  'refund_shipping',
  'settlement',
];

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: LEDGER_KINDS, required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },
    orderItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'OrderItem' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    amountPaise: { type: Number, required: true },
    // accrued = earned but not yet payable; payable = eligible for settlement; settled = paid out.
    status: { type: String, enum: ['accrued', 'payable', 'settled'], default: 'accrued' },
    settlementId: { type: mongoose.Schema.Types.ObjectId },
    note: { type: String, maxlength: 200 },
  },
  { timestamps: true },
);
schema.index({ key: 1 }, { unique: true });
schema.index({ vendorId: 1, status: 1 });
schema.index({ kind: 1, createdAt: -1 });

export default mongoose.model('LedgerEntry', schema);
