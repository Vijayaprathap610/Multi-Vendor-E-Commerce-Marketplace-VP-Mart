import pino from 'pino';
import env from '../config/env.js';

// Sensitive fields are redacted so passwords, tokens and OTPs never reach logs.
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.otp',
    ],
    censor: '[redacted]',
  },
});
