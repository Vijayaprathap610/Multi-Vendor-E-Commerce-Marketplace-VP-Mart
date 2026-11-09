import Session from '../models/Session.js';
import User, { LOGIN_ALLOWED } from '../models/User.js';
import { forbidden, unauthorized } from '../utils/AppError.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../services/sessionService.js';

// Verifies the JWT, then confirms against the database that the session is still valid
// and the account is still allowed to sign in. Role comes from the database, never the token.
export async function authenticate(req, _res, next) {
  const authHeader = req.get?.('authorization') || req.headers?.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = req.cookies?.[ACCESS_COOKIE] || bearerToken;
  if (!token) throw unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Session expired or invalid', 'TOKEN_INVALID');
  }

  const session = await Session.findOne({
    _id: payload.sid,
    userId: payload.sub,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) throw unauthorized('Session has been revoked', 'SESSION_REVOKED');

  const user = await User.findById(payload.sub);
  if (!user || !LOGIN_ALLOWED.includes(user.status)) {
    throw unauthorized('Account is not active', 'ACCOUNT_INACTIVE');
  }
  req.user = user;
  req.sessionId = session._id;
  next();
}

export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };

// For routes that require a fully approved account (e.g. vendors selling products).
export const requireActive = (req, _res, next) => {
  if (req.user?.status !== 'active') {
    throw forbidden('Your account is awaiting approval', 'ACCOUNT_NOT_APPROVED');
  }
  next();
};
