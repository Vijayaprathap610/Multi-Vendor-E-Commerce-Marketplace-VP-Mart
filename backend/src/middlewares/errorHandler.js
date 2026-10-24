import { ZodError } from 'zod';
import multer from 'multer';
import env from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler = (req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));

export function errorHandler(err, req, res, _next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Please correct the highlighted fields';
    details = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      details[key] ??= issue.message;
    }
  } else if (err?.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    message = 'A record with these details already exists';
  } else if (err?.name === 'CastError') {
    status = 400;
    code = 'BAD_ID';
    message = 'Invalid identifier';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    code = 'BAD_JSON';
    message = 'Malformed JSON body';
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 5 MB)' : 'Invalid upload';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  }

  if (status >= 500) logger.error({ err, path: req.path }, 'unhandled error');
  const body = { error: { code, message } };
  if (details) body.error.details = details;
  if (status >= 500 && env.NODE_ENV !== 'production') body.error.debug = err?.message;
  res.status(status).json(body);
}
