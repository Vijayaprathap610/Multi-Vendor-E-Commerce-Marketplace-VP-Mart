import { api } from './api.js';

const clean = (o) =>
  Object.fromEntries(
    Object.entries(o).filter(
      ([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length),
    ),
  );

export const catalogService = {
  config: () => api.get('/catalog/config').then((r) => r.data),
  home: () => api.get('/catalog/home').then((r) => r.data),
  banners: () => api.get('/catalog/banners').then((r) => r.data.items),
  bannerClick: (id) => api.post(`/catalog/banners/${id}/click`).catch(() => {}),
  categories: () => api.get('/catalog/categories').then((r) => r.data.items),
  category: (slug) => api.get(`/catalog/categories/${slug}`).then((r) => r.data),
  search: (p) =>
    api
      .get('/catalog/search', {
        params: clean({
          ...p,
          category: p.category?.join?.(',') ?? p.category,
          brand: p.brand?.join?.(',') ?? p.brand,
        }),
      })
      .then((r) => r.data),
  suggest: (q) => api.get('/catalog/suggest', { params: { q } }).then((r) => r.data),
  listing: (id, pincode) =>
    api.get(`/catalog/listings/${id}`, { params: clean({ pincode }) }).then((r) => r.data),
  reviews: (id, page = 1) =>
    api.get(`/catalog/listings/${id}/reviews`, { params: { page } }).then((r) => r.data),
  related: (id) => api.get(`/catalog/listings/${id}/related`).then((r) => r.data.items),
  shop: (slug) => api.get(`/catalog/shops/${slug}`).then((r) => r.data.shop),
  contact: (payload) => api.post('/contact', payload).then((r) => r.data),
};
