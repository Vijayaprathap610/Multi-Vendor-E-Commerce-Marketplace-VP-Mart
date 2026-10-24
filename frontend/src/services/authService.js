import { api, setCsrfToken } from './api.js';

const keepCsrf = (res) => {
  if (res.data?.csrfToken) setCsrfToken(res.data.csrfToken);
  return res.data;
};

export const authService = {
  register: (payload) => api.post('/auth/register', payload).then(keepCsrf),
  login: (payload) => api.post('/auth/login', payload).then(keepCsrf),
  logout: () =>
    api.post('/auth/logout').then((r) => {
      setCsrfToken(null);
      return r.data;
    }),
  me: () => api.get('/auth/me').then((r) => r.data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token, newPassword) =>
    api.post('/auth/reset-password', { token, newPassword }).then((r) => r.data),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),
  updateProfile: (payload) => api.patch('/users/me', payload).then((r) => r.data),
  deactivate: (password) => api.post('/users/me/deactivate', { password }).then((r) => r.data),
  deleteAccount: (password) => api.post('/users/me/delete', { password }).then((r) => r.data),
};
