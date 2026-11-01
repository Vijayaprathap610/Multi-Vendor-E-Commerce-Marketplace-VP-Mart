import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import env from './config/env.js';
import { logger } from './utils/logger.js';
import { buildRouter } from './routes/index.js';
import { csrfProtection } from './middlewares/csrf.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { makeApiLimiter } from './middlewares/rateLimiters.js';
import { validate } from './middlewares/validate.js';
import { storage } from './services/storage.js';
import * as seo from './controllers/seoController.js';
import { idParams, slugParams } from './validators/catalog.js';

export function createApp({
  authLimit = env.AUTH_RATE_LIMIT_MAX,
  strictLimit = env.STRICT_RATE_LIMIT_PER_HOUR,
  apiLimit = env.API_RATE_LIMIT_PER_MIN,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    }),
  );
  app.use(pinoHttp({ logger }));

  // Locally stored images (STORAGE_DRIVER=local). The storefront is on another origin, so these
  // responses must be embeddable cross-origin; nosniff (from helmet) stays on.
  if (storage().name === 'local') {
    app.use(
      '/uploads',
      (_req, res, next) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      },
      express.static(storage().root, {
        immutable: true,
        maxAge: '365d',
        index: false,
        dotfiles: 'deny',
      }),
    );
  }

  app.get('/sitemap.xml', seo.sitemap);
  app.get('/robots.txt', seo.robots);
  app.get('/seo/product/:id', validate({ params: idParams }), seo.seoProduct);
  app.get('/seo/c/:slug', validate({ params: slugParams }), seo.seoCategory);

  app.use(
    express.json({
      limit: '100kb',
      // Webhook signatures are computed over the exact raw bytes, so keep them for those routes.
      verify: (req, _res, buf) => {
        if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());
  app.use('/api', makeApiLimiter(apiLimit));
  app.use('/api', csrfProtection());
  app.use('/api', buildRouter({ authLimit, strictLimit }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
