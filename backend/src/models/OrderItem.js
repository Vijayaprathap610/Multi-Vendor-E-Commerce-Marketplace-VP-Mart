import mongoose from 'mongoose';

// A snapshot of what was bought, so later price, title or category edits never rewrite history.
const schema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    shipmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      required: true,
      index: true,
    },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId },
    title: { type: String, required: true },
    sku: String,
    variant: String,
    image: String,
    unitPaise: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    linePaise: { type: Number, required: true },
    discountPaise: { type: Number, default: 0 },
    netPaise: { type: Number, required: true },
    gstPercent: { type: Number, default: 0 },
    taxPaise: { type: Number, default: 0 },
    commissionPercent: { type: Number, required: true },
    commissionPaise: { type: Number, required: true },
    vendorSharePaise: { type: Number, required: true },
    status: { type: String, enum: ['active', 'cancelled', 'returned'], default: 'active' },
    refundedPaise: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ vendorId: 1, createdAt: -1 });
schema.index({ listingId: 1 });
schema.index({ productId: 1 });

export default mongoose.model('OrderItem', schema);
