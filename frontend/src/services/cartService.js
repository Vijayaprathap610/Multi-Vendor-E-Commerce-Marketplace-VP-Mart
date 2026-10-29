import { api } from './api.js';

export const cartService = {
  get: () => api.get('/cart').then((r) => r.data),
  add: (listingId, quantity = 1) =>
    api.post('/cart/items', { listingId, quantity }).then((r) => r.data),
  setQuantity: (listingId, quantity) =>
    api.patch(`/cart/items/${listingId}`, { quantity }).then((r) => r.data),
  remove: (listingId) => api.delete(`/cart/items/${listingId}`).then((r) => r.data),
  clear: () => api.delete('/cart').then((r) => r.data),
  orders: () => api.get('/orders').then((r) => r.data.items),
};
