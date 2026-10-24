import mongoose from 'mongoose';

const cartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        _id: false,
        listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
        quantity: { type: Number, required: true, min: 1, max: 20 },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
cartSchema.index({ userId: 1 }, { unique: true });

export default mongoose.model('Cart', cartSchema);
