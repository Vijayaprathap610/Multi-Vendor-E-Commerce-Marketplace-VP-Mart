import { api } from './api.js';

const d = (r) => r.data;

export const deliveryService = {
  getProfile: () => api.get('/delivery/profile').then(d),
  updateProfile: (data) => api.patch('/delivery/profile', data).then(d),
  listAvailable: () => api.get('/delivery/available').then(d),
  acceptPickup: (shipmentId) => api.post(`/delivery/shipments/${shipmentId}/accept`, {}).then(d),
  pickupPackage: (shipmentId) => api.post(`/delivery/shipments/${shipmentId}/pickup`, {}).then(d),
  verifyOtp: (shipmentId, otp) => api.post(`/delivery/shipments/${shipmentId}/verify-otp`, { otp }).then(d),
  reportFailed: (shipmentId, data) => api.post(`/delivery/shipments/${shipmentId}/failed`, data).then(d),
  returnToVendor: (shipmentId, reason) => api.post(`/delivery/shipments/${shipmentId}/return`, { reason }).then(d),
  myDeliveries: (status) => api.get('/delivery/my-deliveries', { params: status ? { status } : {} }).then(d),
  myEarnings: () => api.get('/delivery/earnings').then(d),
  vendorRequestPickup: (shipmentId) => api.post(`/vendor/shipments/${shipmentId}/request-pickup`, {}).then(d),
};

export const reviewService = {
  create: (data) => api.post('/reviews', data).then(d),
  getMyReviews: () => api.get('/reviews/mine').then(d),
};

export const invoiceService = {
  downloadUrl: (orderId) => `/api/orders/${orderId}/invoice`,
};

export const reportsService = {
  getRevenue: () => api.get('/admin/reports/revenue').then(d),
  listSettlements: (vendorId) => api.get('/admin/settlements', { params: vendorId ? { vendorId } : {} }).then(d),
  createSettlement: (data) => api.post('/admin/settlements', data).then(d),
  getVendorSettlements: () => api.get('/vendor/settlements').then(d),
  deleteVendor: (vendorId, reason) => api.delete(`/admin/vendors/${vendorId}`, { data: { reason } }).then(d),
};

export const adminCouponService = {
  list: (params) => api.get('/admin/coupons', { params }).then(d),
  create: (data) => api.post('/admin/coupons', data).then(d),
  createForProduct: (productId, data) => api.post(`/admin/products/${productId}/coupons`, data).then(d),
  update: (id, data) => api.patch(`/admin/coupons/${id}`, data).then(d),
  redemptions: (id) => api.get(`/admin/coupons/${id}/redemptions`).then(d),
};
