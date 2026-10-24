import mongoose from 'mongoose';

// A Product is the underlying, vendor-independent item (e.g. "Amul Vanilla Ice Cream 1L").
// Many vendors can sell it through their own Listing.
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', index: true },
    brandName: { type: String, trim: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    description: { type: String, trim: true, maxlength: 4000 },
    // Device-specific, only accepted for categories flagged deviceFields.
    model: { type: String, trim: true, maxlength: 80 },
    version: { type: String, trim: true, maxlength: 80 },
    deviceType: { type: String, trim: true, maxlength: 80 },
    attributes: { type: Map, of: String },
    // Lower-cased brand|name|model|version used to link vendors to the same product.
    matchKey: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
productSchema.index({ matchKey: 1 }, { unique: true });

export default mongoose.model('Product', productSchema);
