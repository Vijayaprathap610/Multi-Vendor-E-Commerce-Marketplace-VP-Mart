import { api } from './api.js';

export const vendorService = {
  profile: () => api.get('/vendor/profile').then((r) => r.data),
  saveProfile: (p) => api.put('/vendor/profile', p).then((r) => r.data),
  submitProfile: () => api.post('/vendor/profile/submit').then((r) => r.data),
  summary: () => api.get('/vendor/summary').then((r) => r.data.summary),
  listings: (params) => api.get('/vendor/listings', { params }).then((r) => r.data),
  listing: (id) => api.get(`/vendor/listings/${id}`).then((r) => r.data.listing),
  create: (p) => api.post('/vendor/listings', p).then((r) => r.data.listing),
  update: (id, p) => api.patch(`/vendor/listings/${id}`, p).then((r) => r.data.listing),
  stopSelling: (id) => api.delete(`/vendor/listings/${id}`).then((r) => r.data.listing),
};

export const uploadService = {
  image: (file, purpose) => {
    const fd = new FormData();
    fd.append('image', file);
    return api
      .post('/uploads/image', fd, {
        params: { purpose },
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};
