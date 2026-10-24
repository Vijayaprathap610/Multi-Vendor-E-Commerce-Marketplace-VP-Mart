import { Router } from 'express';
import mongoose from 'mongoose';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as admin from '../controllers/adminController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { makeAuthLimiter, makeStrictLimiter } from '../middlewares/rateLimiters.js';
import * as v from '../validators/auth.js';
import * as uv from '../validators/users.js';

export function buildRouter({ authLimit, strictLimit }) {
  const r = Router();
  const authLimiter = makeAuthLimiter(authLimit);
  const strictLimiter = makeStrictLimiter(strictLimit);

  r.get('/health', (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', db: up });
  });

  // --- Authentication ---
  r.get('/auth/csrf', auth.csrf);
  r.post('/auth/register', authLimiter, validate({ body: v.registerBody }), auth.register);
  r.post('/auth/login', authLimiter, validate({ body: v.loginBody }), auth.login);
  r.post('/auth/refresh', authLimiter, auth.refresh);
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

  // --- Admin ---
  const adminOnly = [authenticate, authorize('admin')];
  r.get('/admin/users', ...adminOnly, validate({ query: uv.adminListQuery }), admin.listUsers);
  r.get('/admin/stats/users', ...adminOnly, admin.userStats);
  r.patch(
    '/admin/users/:id/status',
    ...adminOnly,
    validate({ params: uv.adminUserIdParams, body: uv.adminStatusBody }),
    admin.setUserStatus,
  );

  return r;
}
