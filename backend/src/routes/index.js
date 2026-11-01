import { Router } from 'express';
import mongoose from 'mongoose';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as admin from '../controllers/adminController.js';
import * as adminCat from '../controllers/adminCatalogController.js';
import * as catalog from '../controllers/catalogController.js';
import * as vendor from '../controllers/vendorController.js';
import * as cart from '../controllers/cartController.js';
import * as upload from '../controllers/uploadController.js';
import * as contact from '../controllers/contactController.js';
import * as commerce from '../controllers/commerceController.js';
import * as adminCom from '../controllers/adminCommerceController.js';
import * as vendorOrders from '../controllers/vendorOrdersController.js';
import * as ccv from '../validators/commerce.js';
import { authenticate, authorize, requireActive } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { makeAuthLimiter, makeStrictLimiter } from '../middlewares/rateLimiters.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as v from '../validators/auth.js';
import * as uv from '../validators/users.js';
import * as cv from '../validators/catalog.js';
import * as vv from '../validators/vendor.js';
import * as av from '../validators/admin.js';

export function buildRouter({ authLimit, strictLimit }) {
  const r = Router();
  const authLimiter = makeAuthLimiter(authLimit);
  // Only FAILED logins/refreshes count toward the brute-force limit, so normal use never locks people out.
  const loginLimiter = makeAuthLimiter(authLimit, { skipSuccessful: true });
  const refreshLimiter = makeAuthLimiter(authLimit * 3, { skipSuccessful: true });
  const strictLimiter = makeStrictLimiter(strictLimit);
  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    keyGenerator: (req) => (req.user?._id ? `u:${req.user._id}` : ipKeyGenerator(req.ip)),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_q, s) =>
      s
        .status(429)
        .json({ error: { code: 'RATE_LIMITED', message: 'Too many uploads. Try again later.' } }),
  });

  r.get('/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', db: up });
  });

  // --- Authentication ---
  r.get('/auth/csrf', auth.csrf);
  r.post('/auth/register', authLimiter, validate({ body: v.registerBody }), auth.register);
  r.post('/auth/login', loginLimiter, validate({ body: v.loginBody }), auth.login);
  r.post('/auth/refresh', refreshLimiter, auth.refresh);
  r.post('/auth/logout', auth.logout);
  r.get('/auth/me', authenticate, auth.me);
  r.post(
    '/auth/forgot-password',
    strictLimiter,
    validate({ body: v.forgotBody }),
    auth.forgotPassword,
  );
  r.post('/auth/reset-password', authLimiter, validate({ body: v.resetBody }), auth.resetPassword);
  r.post(
    '/auth/change-password',
    authenticate,
    authLimiter,
    validate({ body: v.changePasswordBody }),
    auth.changePassword,
  );

  // --- Current user ---
  r.patch('/users/me', authenticate, validate({ body: uv.updateProfileBody }), users.updateMe);
  r.post(
    '/users/me/deactivate',
    authenticate,
    authLimiter,
    validate({ body: uv.passwordConfirmBody }),
    users.deactivateMe,
  );
  r.post(
    '/users/me/delete',
    authenticate,
    authLimiter,
    validate({ body: uv.passwordConfirmBody }),
    users.deleteMe,
  );

  // --- Public catalogue ---
  r.get('/catalog/config', catalog.config);
  r.get('/catalog/home', catalog.home);
  r.get('/catalog/banners', catalog.banners);
  r.post('/catalog/banners/:id/click', validate({ params: cv.idParams }), catalog.bannerClick);
  r.get('/catalog/categories', catalog.categories);
  r.get('/catalog/categories/:slug', validate({ params: cv.slugParams }), catalog.category);
  r.get('/catalog/search', validate({ query: cv.searchQuery }), catalog.search);
  r.get('/catalog/suggest', validate({ query: cv.suggestQuery }), catalog.suggest);
  r.get(
    '/catalog/listings/:id',
    validate({ params: cv.idParams, query: cv.pincodeQuery }),
    catalog.listingDetail,
  );
  r.get(
    '/catalog/listings/:id/reviews',
    validate({ params: cv.idParams, query: cv.pageQuery }),
    catalog.listingReviews,
  );
  r.get('/catalog/listings/:id/related', validate({ params: cv.idParams }), catalog.related);
  r.get('/catalog/shops/:slug', validate({ params: cv.slugParams }), catalog.vendorShop);
  r.get('/catalog/coupons', catalog.publicCoupons);
  r.post('/contact', strictLimiter, validate({ body: cv.contactBody }), contact.submit);

  // --- Uploads ---
  r.post(
    '/uploads/image',
    authenticate,
    uploadLimiter,
    upload.uploadMiddleware,
    upload.uploadImage,
  );

  // --- Buyer: cart and orders ---
  const buyer = [authenticate, authorize('buyer')];
  r.get('/cart', ...buyer, cart.get);
  r.post('/cart/items', ...buyer, validate({ body: cv.cartAddBody }), cart.add);
  r.patch(
    '/cart/items/:listingId',
    ...buyer,
    validate({ params: cv.cartItemParams, body: cv.cartSetBody }),
    cart.setQty,
  );
  r.delete(
    '/cart/items/:listingId',
    ...buyer,
    validate({ params: cv.cartItemParams }),
    cart.remove,
  );
  r.delete('/cart', ...buyer, cart.clear);
  r.post('/pricing/quote', ...buyer, validate({ body: cv.quoteBody }), cart.quote);
  r.post(
    '/cart/coupon',
    ...buyer,
    validate({ body: ccv.couponApplyBody }),
    commerce.applyCartCoupon,
  );
  r.delete('/cart/coupon', ...buyer, commerce.removeCartCoupon);

  // --- Buyer: addresses, checkout, orders, payments ---
  r.get('/addresses', ...buyer, commerce.listAddresses);
  r.post('/addresses', ...buyer, validate({ body: ccv.addressBody }), commerce.createAddress);
  r.patch(
    '/addresses/:id',
    ...buyer,
    validate({ params: cv.idParams, body: ccv.addressUpdateBody }),
    commerce.updateAddress,
  );
  r.delete('/addresses/:id', ...buyer, validate({ params: cv.idParams }), commerce.deleteAddress);
  r.post(
    '/checkout/preview',
    ...buyer,
    validate({ body: ccv.previewBody }),
    commerce.previewCheckout,
  );
  r.post('/checkout', ...buyer, validate({ body: ccv.checkoutBody }), commerce.checkout);
  r.get('/orders', ...buyer, validate({ query: ccv.ordersQuery }), commerce.listMyOrders);
  r.get('/orders/:id', ...buyer, validate({ params: cv.idParams }), commerce.getMyOrder);
  r.post(
    '/orders/:id/cancel',
    ...buyer,
    validate({ params: cv.idParams, body: ccv.cancelOrderBody }),
    commerce.cancelMyOrder,
  );
  r.post(
    '/payments/verify',
    ...buyer,
    validate({ body: ccv.verifyPaymentBody }),
    commerce.verifyPayment,
  );
  r.post(
    '/payments/failed',
    ...buyer,
    validate({ body: ccv.paymentFailedBody }),
    commerce.paymentFailed,
  );
  // Provider webhook: no cookies/CSRF; authenticated by HMAC over the raw body.
  r.post('/webhooks/razorpay', commerce.razorpayWebhook);

  // --- Any signed-in user: notifications ---
  r.get(
    '/notifications',
    authenticate,
    validate({ query: ccv.notificationsQuery }),
    commerce.listNotifications,
  );
  r.post(
    '/notifications/read',
    authenticate,
    validate({ body: ccv.notificationsReadBody }),
    commerce.markNotificationsRead,
  );

  // --- Vendor ---
  const vendorOnly = [authenticate, authorize('vendor')];
  r.get('/vendor/profile', ...vendorOnly, vendor.getMyProfile);
  r.put('/vendor/profile', ...vendorOnly, validate({ body: vv.profileBody }), vendor.saveMyProfile);
  r.post('/vendor/profile/submit', ...vendorOnly, vendor.submitMyProfile);
  const vendorActive = [...vendorOnly, requireActive];
  r.get('/vendor/summary', ...vendorActive, vendor.summary);
  r.get('/vendor/orders', ...vendorActive, vendorOrders.listVendorOrders);
  r.get(
    '/vendor/orders/:id',
    ...vendorActive,
    validate({ params: cv.idParams }),
    vendorOrders.getVendorOrder,
  );
  r.get(
    '/vendor/listings',
    ...vendorActive,
    validate({ query: vv.vendorListingsQuery }),
    vendor.listMine,
  );
  r.post(
    '/vendor/listings',
    ...vendorActive,
    validate({ body: vv.listingCreateBody }),
    vendor.create,
  );
  r.get('/vendor/listings/:id', ...vendorActive, validate({ params: cv.idParams }), vendor.getMine);
  r.patch(
    '/vendor/listings/:id',
    ...vendorActive,
    validate({ params: cv.idParams, body: vv.listingUpdateBody }),
    vendor.update,
  );
  r.delete(
    '/vendor/listings/:id',
    ...vendorActive,
    validate({ params: cv.idParams }),
    vendor.stopSelling,
  );

  // --- Admin ---
  const adminOnly = [authenticate, authorize('admin')];
  r.get('/admin/users', ...adminOnly, validate({ query: uv.adminListQuery }), admin.listUsers);
  r.get('/admin/stats/users', ...adminOnly, admin.userStats);
  r.get('/admin/stats/overview', ...adminOnly, adminCat.overview);
  r.patch(
    '/admin/users/:id/status',
    ...adminOnly,
    validate({ params: uv.adminUserIdParams, body: uv.adminStatusBody }),
    admin.setUserStatus,
  );

  r.get('/admin/vendors', ...adminOnly, validate({ query: av.vendorsQuery }), adminCat.listVendors);
  r.get('/admin/vendors/:id', ...adminOnly, validate({ params: cv.idParams }), adminCat.getVendor);
  r.post(
    '/admin/vendors/:id/warnings',
    ...adminOnly,
    validate({ params: cv.idParams, body: av.warningBody }),
    adminCat.warnVendor,
  );

  r.get('/admin/categories', ...adminOnly, adminCat.listCategories);
  r.post(
    '/admin/categories',
    ...adminOnly,
    validate({ body: av.categoryCreateBody }),
    adminCat.createCategory,
  );
  r.patch(
    '/admin/categories/:id',
    ...adminOnly,
    validate({ params: cv.idParams, body: av.categoryUpdateBody }),
    adminCat.updateCategory,
  );
  r.get('/admin/brands', ...adminOnly, adminCat.listBrands);
  r.post('/admin/brands', ...adminOnly, validate({ body: av.brandBody }), adminCat.createBrand);
  r.patch(
    '/admin/brands/:id',
    ...adminOnly,
    validate({ params: cv.idParams, body: av.brandUpdateBody }),
    adminCat.updateBrand,
  );

  r.get('/admin/banners', ...adminOnly, adminCat.listBanners);
  r.post(
    '/admin/banners',
    ...adminOnly,
    validate({ body: av.bannerCreateBody }),
    adminCat.createBanner,
  );
  r.patch(
    '/admin/banners/:id',
    ...adminOnly,
    validate({ params: cv.idParams, body: av.bannerUpdateBody }),
    adminCat.updateBanner,
  );
  r.delete(
    '/admin/banners/:id',
    ...adminOnly,
    validate({ params: cv.idParams }),
    adminCat.deleteBanner,
  );

  r.get(
    '/admin/listings',
    ...adminOnly,
    validate({ query: av.adminListingsQuery }),
    adminCat.adminListings,
  );
  r.patch(
    '/admin/listings/:id/moderation',
    ...adminOnly,
    validate({ params: cv.idParams, body: av.moderationBody }),
    adminCat.moderateListing,
  );

  r.get(
    '/admin/coupons',
    ...adminOnly,
    validate({ query: ccv.couponsQuery }),
    adminCom.listCoupons,
  );
  r.post(
    '/admin/coupons',
    ...adminOnly,
    validate({ body: ccv.couponCreateBody }),
    adminCom.createGeneralCoupon,
  );
  r.post(
    '/admin/products/:id/coupons',
    ...adminOnly,
    validate({ params: cv.idParams, body: ccv.couponForProductBody }),
    adminCom.createProductCoupon,
  );
  r.patch(
    '/admin/coupons/:id',
    ...adminOnly,
    validate({ params: cv.idParams, body: ccv.couponUpdateBody }),
    adminCom.updateCoupon,
  );
  r.get(
    '/admin/coupons/:id/redemptions',
    ...adminOnly,
    validate({ params: cv.idParams }),
    adminCom.couponRedemptions,
  );
  r.get(
    '/admin/orders',
    ...adminOnly,
    validate({ query: ccv.adminOrdersQuery }),
    adminCom.adminOrders,
  );
  r.get('/admin/orders/:id', ...adminOnly, validate({ params: cv.idParams }), adminCom.adminOrder);
  r.get(
    '/admin/payments',
    ...adminOnly,
    validate({ query: ccv.adminPaymentsQuery }),
    adminCom.adminPayments,
  );
  r.get('/admin/refunds', ...adminOnly, adminCom.adminRefunds);
  r.post(
    '/admin/refunds/:id/retry',
    ...adminOnly,
    validate({ params: cv.idParams }),
    adminCom.retryRefund,
  );
  r.get('/admin/settings', ...adminOnly, adminCom.getSettings);
  r.put(
    '/admin/settings',
    ...adminOnly,
    validate({ body: ccv.settingsBody }),
    adminCom.putSettings,
  );
  r.get('/admin/messages', ...adminOnly, adminCat.listMessages);
  r.patch(
    '/admin/messages/:id/resolve',
    ...adminOnly,
    validate({ params: cv.idParams }),
    adminCat.resolveMessage,
  );

  return r;
}
