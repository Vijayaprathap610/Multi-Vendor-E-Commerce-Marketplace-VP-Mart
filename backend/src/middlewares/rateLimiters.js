import rateLimit from 'express-rate-limit';

const handler = (_req, res) =>
  res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
  });

export const makeAuthLimiter = (max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
  });

export const makeStrictLimiter = (max) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
  });

export const makeApiLimiter = (max) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler,
  });
