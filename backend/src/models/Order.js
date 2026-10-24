import mongoose from 'mongoose';

// Minimal shell so "My orders" reads a real collection. The full order, payment, shipment and
// ledger schema is added with checkout.
const orderSchema = new mongoose.Schema(
  {
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderNumber: { type: String, required: true },
    status: { type: String, required: true },
    totalPaise: { type: Number, required: true },
  },
  { timestamps: true },
);
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ buyerId: 1, createdAt: -1 });

export default mongoose.model('Order', orderSchema);
