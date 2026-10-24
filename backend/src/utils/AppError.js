export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (m = 'Bad request', c = 'BAD_REQUEST', d) => new AppError(400, c, m, d);
export const unauthorized = (m = 'Authentication required', c = 'UNAUTHENTICATED') =>
  new AppError(401, c, m);
export const forbidden = (m = 'You do not have permission to do this', c = 'FORBIDDEN') =>
  new AppError(403, c, m);
export const notFound = (m = 'Resource not found', c = 'NOT_FOUND') => new AppError(404, c, m);
export const conflict = (m = 'Conflict', c = 'CONFLICT') => new AppError(409, c, m);
