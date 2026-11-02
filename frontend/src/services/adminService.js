import { api } from './api.js';

const d = (r) => r.data;
export const adminService = {
  overview: () => api.get('/admin/stats/overview').then(d),
  users: (params) => api.get('/admin/users', { params }).then(d),
  setUserStatus: (id, status, reason) =>
    api.patch(`/admin/users/${id}/status`, { status, reason }).then(d),
  vendors: (params) => api.get('/admin/vendors', { params }).then(d),
  vendor: (id) => api.get(`/admin/vendors/${id}`).then(d),
  warnVendor: (id, message) => api.post(`/admin/vendors/${id}/warnings`, { message }).then(d),
  categories: () => api.get('/admin/categories').then((r) => r.data.items),
  createCategory: (p) => api.post('/admin/categories', p).then(d),
  updateCategory: (id, p) => api.patch(`/admin/categories/${id}`, p).then(d),
  brands: () => api.get('/admin/brands').then((r) => r.data.items),
  createBrand: (p) => api.post('/admin/brands', p).then(d),
  updateBrand: (id, p) => api.patch(`/admin/brands/${id}`, p).then(d),
  banners: () => api.get('/admin/banners').then((r) => r.data.items),
  createBanner: (p) => api.post('/admin/banners', p).then(d),
  updateBanner: (id, p) => api.patch(`/admin/banners/${id}`, p).then(d),
  deleteBanner: (id) => api.delete(`/admin/banners/${id}`).then(d),
  listings: (params) => api.get('/admin/listings', { params }).then(d),
  moderate: (id, action, reason) =>
    api.patch(`/admin/listings/${id}/moderation`, { action, reason }).then(d),
  messages: () => api.get('/admin/messages').then((r) => r.data.items),
  resolveMessage: (id) => api.patch(`/admin/messages/${id}/resolve`).then(d),
};

Object.assign(adminService, {
  coupons: (params) => api.get('/admin/coupons', { params }).then(d),
  createCoupon: (p) => api.post('/admin/coupons', p).then(d),
  createProductCoupon: (productId, p) =>
    api.post(`/admin/products/${productId}/coupons`, p).then(d),
  updateCoupon: (id, p) => api.patch(`/admin/coupons/${id}`, p).then(d),
  couponRedemptions: (id) => api.get(`/admin/coupons/${id}/redemptions`).then((r) => r.data.items),
  orders: (params) => api.get('/admin/orders', { params }).then(d),
  order: (id) => api.get(`/admin/orders/${id}`).then((r) => r.data.order),
  payments: (params) => api.get('/admin/payments', { params }).then(d),
  refunds: () => api.get('/admin/refunds').then((r) => r.data.items),
  retryRefund: (id) => api.post(`/admin/refunds/${id}/retry`).then(d),
  settings: () => api.get('/admin/settings').then(d),
  saveSettings: (p) => api.put('/admin/settings', p).then(d),
});
