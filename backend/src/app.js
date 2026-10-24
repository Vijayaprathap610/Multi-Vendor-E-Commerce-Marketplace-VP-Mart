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

export function createApp({
  authLimit = env.AUTH_RATE_LIMIT_MAX,
  strictLimit = 5,
  apiLimit = 300,
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
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', makeApiLimiter(apiLimit));
  app.use('/api', csrfProtection());
  app.use('/api', buildRouter({ authLimit, strictLimit }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
