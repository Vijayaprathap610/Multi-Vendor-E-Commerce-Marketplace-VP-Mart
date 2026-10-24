import env from '../config/env.js';
import User, { LOGIN_ALLOWED } from '../models/User.js';
import Session from '../models/Session.js';
import { AppError, conflict, forbidden, unauthorized } from '../utils/AppError.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { audit } from '../services/auditService.js';
import { passwordResetEmail, sendMail } from '../services/mailer.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  createSession,
  revokeAllSessions,
  revokeSession,
  rotateRefreshToken,
  setAuthCookies,
  setCsrfCookie,
} from '../services/sessionService.js';
import { dummyCompare, hashPassword, verifyPassword } from '../services/userService.js';

const INACTIVE_MESSAGES = {
  suspended: 'This account has been suspended. Please contact support.',
  rejected: 'This application was not approved. Please contact support.',
  deactivated: 'This account is deactivated. Please contact support to reactivate it.',
  deleted: 'Invalid email or password',
};

export function csrf(_req, res) {
  res.json({ csrfToken: setCsrfCookie(res) });
}

export async function register(req, res) {
  const { name, email, phone, password, role } = req.valid.body;
  const status = role === 'buyer' ? 'active' : 'pending_approval';
  let user;
  try {
    user = await User.create({
      name,
      email,
      phone,
      role,
      status,
      passwordHash: await hashPassword(password),
      passwordChangedAt: new Date(),
    });
  } catch (err) {
    if (err?.code === 11000)
      throw conflict('An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }
  const { session, refreshToken } = await createSession(user, req);
  const csrfToken = setAuthCookies(res, user, session, refreshToken);
  await audit(req, 'auth.register', {
    actor: user,
    target: { type: 'User', id: user._id },
    metadata: { role },
  });
  res.status(201).json({ user, csrfToken });
}

export async function login(req, res) {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  const invalid = new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  if (!user) {
    await dummyCompare(password);
    throw invalid;
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new AppError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { failedLoginCount: 1 } },
      { returnDocument: 'after' },
    );
    if (updated.failedLoginCount >= env.MAX_FAILED_LOGINS) {
      await User.updateOne(
        { _id: user._id },
        { lockUntil: new Date(Date.now() + env.LOCKOUT_MINUTES * 60 * 1000), failedLoginCount: 0 },
      );
      await audit(req, 'auth.lockout', { actor: user, target: { type: 'User', id: user._id } });
    }
    throw invalid;
  }

  if (!LOGIN_ALLOWED.includes(user.status)) {
    if (user.status === 'deleted') throw invalid;
    throw forbidden(INACTIVE_MESSAGES[user.status], `ACCOUNT_${user.status.toUpperCase()}`);
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: 0, lastLoginAt: new Date() }, $unset: { lockUntil: '' } },
  );
  const { session, refreshToken } = await createSession(user, req);
  const csrfToken = setAuthCookies(res, user, session, refreshToken);
  await audit(req, 'auth.login', { actor: user, target: { type: 'User', id: user._id } });
  res.json({ user, csrfToken });
}

export async function refresh(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized('No refresh token', 'NO_REFRESH');
  const rotated = await rotateRefreshToken(token);
  if (!rotated) {
    clearAuthCookies(res);
    throw unauthorized('Session expired. Please sign in again.', 'REFRESH_INVALID');
  }
  const user = await User.findById(rotated.session.userId);
  if (!user || !LOGIN_ALLOWED.includes(user.status)) {
    await revokeSession(rotated.session._id);
    clearAuthCookies(res);
    throw unauthorized('Account is not active', 'ACCOUNT_INACTIVE');
  }
  const csrfToken = setAuthCookies(res, user, rotated.session, rotated.refreshToken);
  res.json({ user, csrfToken });
}

export async function logout(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token)
    await Session.updateOne(
      { tokenHash: sha256(token), revokedAt: { $exists: false } },
      { revokedAt: new Date() },
    );
  clearAuthCookies(res);
  res.json({ ok: true });
}

export const me = (req, res) => res.json({ user: req.user });

// Always answers the same way so the endpoint cannot be used to discover registered emails.
export async function forgotPassword(req, res) {
  const { email } = req.valid.body;
  const user = await User.findOne({ email });
  if (user && LOGIN_ALLOWED.includes(user.status)) {
    const token = randomToken(32);
    await User.updateOne(
      { _id: user._id },
      { resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 30 * 60 * 1000) },
    );
    const link = `${env.CLIENT_ORIGIN}/reset-password?token=${token}`;
    const mail = passwordResetEmail(user.name, link);
    try {
      await sendMail({ to: user.email, ...mail });
    } catch (err) {
      req.log?.error({ err }, 'password reset email failed');
    }
    await audit(req, 'auth.password_reset_requested', {
      actor: user,
      target: { type: 'User', id: user._id },
    });
  }
  res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
}

export async function resetPassword(req, res) {
  const { token, newPassword } = req.valid.body;
  const user = await User.findOne({
    resetTokenHash: sha256(token),
    resetTokenExpires: { $gt: new Date() },
  }).select('+resetTokenHash +resetTokenExpires');
  if (!user)
    throw new AppError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired');

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
      },
      $unset: { resetTokenHash: '', resetTokenExpires: '', lockUntil: '' },
    },
  );
  await revokeAllSessions(user._id);
  await audit(req, 'auth.password_reset', { actor: user, target: { type: 'User', id: user._id } });
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Current password is incorrect');
  }
  await User.updateOne(
    { _id: user._id },
    { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
  );
  await revokeAllSessions(user._id, req.sessionId);
  await audit(req, 'auth.password_changed', { target: { type: 'User', id: user._id } });
  res.json({ ok: true });
}
