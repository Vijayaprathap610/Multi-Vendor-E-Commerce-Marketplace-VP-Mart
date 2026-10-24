import { forbidden } from '../utils/AppError.js';
import { safeEqual } from '../utils/crypto.js';
import { CSRF_COOKIE } from '../services/sessionService.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit cookie. Signed provider webhooks (added later) are exempt because they
// are authenticated by signature instead of cookies.
export function csrfProtection({ exemptPrefixes = ['/api/webhooks/'] } = {}) {
  return (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    if (exemptPrefixes.some((p) => req.path.startsWith(p) || req.originalUrl.startsWith(p))) {
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
