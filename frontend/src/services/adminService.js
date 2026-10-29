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
