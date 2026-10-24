import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import Session from '../models/Session.js';
import { randomToken, sha256 } from '../utils/crypto.js';

export const ACCESS_COOKIE = 'vp_access';
export const REFRESH_COOKIE = 'vp_refresh';
export const CSRF_COOKIE = 'vp_csrf';

const baseCookie = () => ({
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  domain: env.COOKIE_DOMAIN || undefined,
});

export function signAccessToken(user, sessionId) {
  return jwt.sign({ role: user.role, sid: String(sessionId) }, env.JWT_ACCESS_SECRET, {
    subject: String(user._id),
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

export function setCsrfCookie(res) {
  const token = randomToken(24);
  // Readable by the SPA on purpose (double-submit pattern); it protects nothing by itself.
  res.cookie(CSRF_COOKIE, token, { ...baseCookie(), httpOnly: false, path: '/' });
  return token;
}

export function setAuthCookies(res, user, session, refreshToken) {
  res.cookie(ACCESS_COOKIE, signAccessToken(user, session._id), {
    ...baseCookie(),
    httpOnly: true,
    path: '/',
    maxAge: env.ACCESS_TOKEN_TTL_MIN * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie(),
    httpOnly: true,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000,
  });
  return setCsrfCookie(res);
}

export function clearAuthCookies(res) {
  const opts = baseCookie();
  res.clearCookie(ACCESS_COOKIE, { ...opts, httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...opts, httpOnly: true, path: '/api/auth' });
  res.clearCookie(CSRF_COOKIE, { ...opts, path: '/' });
}

export async function createSession(user, req) {
  const refreshToken = randomToken(48);
  const session = await Session.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000),
    userAgent: req.get('user-agent')?.slice(0, 300),
    ip: req.ip,
  });
  return { session, refreshToken };
}

// Rotates a refresh token. Presenting an already-rotated token is treated as theft:
// the whole session is revoked.
export async function rotateRefreshToken(oldToken) {
  const oldHash = sha256(oldToken);
  const newToken = randomToken(48);
  const now = new Date();
  const session = await Session.findOneAndUpdate(
    { tokenHash: oldHash, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
    {
      $set: {
        tokenHash: sha256(newToken),
        prevTokenHash: oldHash,
        expiresAt: new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000),
      },
    },
    { new: true },
  );
  if (session) return { session, refreshToken: newToken };

  const reused = await Session.findOne({ prevTokenHash: oldHash });
  if (reused && !reused.revokedAt) {
    reused.revokedAt = now;
    await reused.save();
  }
  return null;
}

export const revokeSession = (sessionId) =>
  Session.updateOne({ _id: sessionId, revokedAt: { $exists: false } }, { revokedAt: new Date() });

export const revokeAllSessions = (userId, exceptSessionId) =>
  Session.updateMany(
    {
      userId,
      revokedAt: { $exists: false },
      ...(exceptSessionId ? { _id: { $ne: exceptSessionId } } : {}),
    },
    { revokedAt: new Date() },
  );
