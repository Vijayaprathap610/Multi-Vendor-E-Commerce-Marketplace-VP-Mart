import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Listing from '../models/Listing.js';
import Product from '../models/Product.js';
import { AppError } from '../utils/AppError.js';

export async function createReview(req, res, next) {
  try {
    const { listingId, rating, title, body } = req.body;
    const buyerId = req.user._id;

    const listing = await Listing.findById(listingId);
    if (!listing) throw new AppError(404, 'NOT_FOUND', 'Listing not found');

    // Verify buyer eligibility: must have completed an order with this listing
    const eligibleItem = await OrderItem.findOne({
      buyerId,
      listingId,
    });

    if (!eligibleItem) {
      throw new AppError(403, 'NOT_ELIGIBLE', 'Only verified purchasers can review this product.');
    }

    // Check if order was confirmed/completed
    const order = await Order.findById(eligibleItem.orderId);
    if (!order || (order.status !== 'confirmed' && order.status !== 'completed')) {
      throw new AppError(403, 'NOT_ELIGIBLE', 'You can only review items from completed or confirmed orders.');
    }

    const review = await Review.findOneAndUpdate(
      { listingId, buyerId },
      {
        productId: listing.productId,
        orderId: order._id,
        rating: Number(rating),
        title,
        body,
        status: 'visible',
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Recompute listing rating
    const stats = await Review.aggregate([
      { $match: { listingId: listing._id, status: 'visible' } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);

    const ratingAvg = stats.length > 0 ? Math.round(stats[0].avg * 10) / 10 : 0;
    const ratingCount = stats.length > 0 ? stats[0].count : 0;

    await Listing.updateOne(
      { _id: listing._id },
      { $set: { ratingAvg, ratingCount } },
    );

    res.status(201).json({
      message: 'Review submitted successfully',
      review,
      listingStats: { ratingAvg, ratingCount },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyReviews(req, res, next) {
  try {
    const reviews = await Review.find({ buyerId: req.user._id })
      .populate('listingId', 'productName pricePaise images')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ reviews });
  } catch (err) {
    next(err);
  }
}
