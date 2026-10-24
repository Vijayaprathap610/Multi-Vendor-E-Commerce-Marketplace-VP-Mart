import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 100 },
    body: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
  },
  { timestamps: true },
);
reviewSchema.index({ listingId: 1, buyerId: 1 }, { unique: true });
reviewSchema.index({ listingId: 1, status: 1, createdAt: -1 });

export default mongoose.model('Review', reviewSchema);
