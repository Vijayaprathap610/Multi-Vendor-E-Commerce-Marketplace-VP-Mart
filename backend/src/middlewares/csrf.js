import { forbidden } from '../utils/AppError.js';
import { safeEqual } from '../utils/crypto.js';
import { CSRF_COOKIE } from '../services/sessionService.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Public endpoints that do not have an active session yet, plus signed webhooks.
// refresh and logout authenticate via HttpOnly refresh cookie — no CSRF token available
// at the moment they are called (access token may have just expired).
const DEFAULT_EXEMPT = [
  '/api/webhooks/',
  '/webhooks/',
  '/api/auth/login',
  '/auth/login',
  '/api/auth/register',
  '/auth/register',
  '/api/auth/forgot-password',
  '/auth/forgot-password',
  '/api/auth/reset-password',
  '/auth/reset-password',
  '/api/auth/csrf',
  '/auth/csrf',
  '/api/auth/refresh',
  '/auth/refresh',
  '/api/auth/logout',
  '/auth/logout',
];

// Double-submit cookie. Signed provider webhooks and initial unauthenticated auth endpoints
// are exempt. Once authenticated, all state-modifying requests require CSRF token match.
export function csrfProtection({ exemptPrefixes = [] } = {}) {
  const allExempt = [...DEFAULT_EXEMPT, ...exemptPrefixes];
  return (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    if (allExempt.some((p) => req.path.startsWith(p) || req.originalUrl.startsWith(p))) {
      return next();
    }
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.get('x-csrf-token');
    if (!cookie || !header || !safeEqual(cookie, header)) {
      throw forbidden('CSRF token missing or invalid', 'CSRF_INVALID');
    }
    next();
  };
}
