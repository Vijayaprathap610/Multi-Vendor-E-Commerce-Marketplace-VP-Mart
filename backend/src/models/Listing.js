import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema(
  { key: String, url: String, thumbUrl: String, alt: { type: String, maxlength: 140 } },
  { _id: false },
);

// A Listing is one vendor's offer for a Product: own price, stock, images and delivery terms.
const listingSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    sku: { type: String, required: true, trim: true, maxlength: 60 },
    variant: { type: String, trim: true, maxlength: 80, default: '' },
    slug: { type: String, required: true },

    // Denormalised for fast, consistent public queries and for the search index.
    title: { type: String, required: true },
    description: { type: String },
    brandId: { type: mongoose.Schema.Types.ObjectId },
    brandName: { type: String },
    categoryId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    subcategoryId: { type: mongoose.Schema.Types.ObjectId },
    categoryName: { type: String },
    categorySlug: { type: String },
    categoryPath: [{ type: mongoose.Schema.Types.ObjectId }],
    gstPercent: { type: Number, default: 18 },
    vendorName: { type: String },
    vendorSlug: { type: String },
    attributes: { type: Map, of: String },

    pricePaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    mrpPaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    stock: { type: Number, required: true, min: 0, default: 0, validate: Number.isInteger },
    soldCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },

    // 'active' = vendor sells it, 'inactive' = vendor stopped selling, 'hidden' = Admin moderation.
    status: {
      type: String,
      enum: ['active', 'inactive', 'hidden'],
      default: 'active',
      index: true,
    },
    hiddenReason: { type: String, maxlength: 300 },
    manualOutOfStock: { type: Boolean, default: false },
    images: { type: [imageSchema], default: [] },
    prescriptionRequired: { type: Boolean, default: false },
    expiryDate: { type: Date },
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },

    // Visibility flags kept in sync by catalogService.refreshVisibility().
    catActive: { type: Boolean, default: true },
    vendorActive: { type: Boolean, default: false },
    isPublic: { type: Boolean, default: false },

    searchDirty: { type: Boolean, default: true },
    searchIndexedAt: { type: Date },
  },
  { timestamps: true },
);

listingSchema.index({ vendorId: 1, sku: 1 }, { unique: true });
// A vendor has one listing per product variant.
listingSchema.index({ vendorId: 1, productId: 1, variant: 1 }, { unique: true });
listingSchema.index({ isPublic: 1, categoryPath: 1, pricePaise: 1 });
listingSchema.index({ isPublic: 1, soldCount: -1 });
listingSchema.index({ isPublic: 1, createdAt: -1 });
listingSchema.index({ isPublic: 1, brandId: 1 });
listingSchema.index({ searchDirty: 1 });
listingSchema.index({ vendorId: 1, status: 1, updatedAt: -1 });

listingSchema.virtual('inStock').get(function () {
  return !this.manualOutOfStock && this.stock > 0;
});

export default mongoose.model('Listing', listingSchema);
