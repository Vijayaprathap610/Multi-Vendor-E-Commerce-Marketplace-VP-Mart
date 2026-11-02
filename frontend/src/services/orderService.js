import { api } from './api.js';

const d = (r) => r.data;
export const addressService = {
  list: () => api.get('/addresses').then((r) => r.data.items),
  create: (p) => api.post('/addresses', p).then((r) => r.data.address),
  update: (id, p) => api.patch(`/addresses/${id}`, p).then((r) => r.data.address),
  remove: (id) => api.delete(`/addresses/${id}`).then(d),
};

export const orderService = {
  preview: (p) => api.post('/checkout/preview', p).then(d),
  checkout: (p) => api.post('/checkout', p).then(d),
  list: (page = 1) => api.get('/orders', { params: { page, limit: 10 } }).then(d),
  get: (id) => api.get(`/orders/${id}`).then((r) => r.data.order),
  cancel: (id, reason) =>
    api.post(`/orders/${id}/cancel`, reason ? { reason } : {}).then((r) => r.data.order),
  verifyPayment: (p) => api.post('/payments/verify', p).then(d),
  paymentFailed: (orderId, reason) => api.post('/payments/failed', { orderId, reason }).then(d),
};

export const notificationService = {
  list: (unread = false) =>
    api.get('/notifications', { params: unread ? { unread: 'true' } : {} }).then(d),
  markAllRead: () => api.post('/notifications/read', { all: true }).then(d),
  markRead: (ids) => api.post('/notifications/read', { ids }).then(d),
};

export const vendorOrderService = {
  list: (page = 1) => api.get('/vendor/orders', { params: { page } }).then(d),
};
