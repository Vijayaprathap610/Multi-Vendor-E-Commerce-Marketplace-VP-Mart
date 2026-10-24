import User from '../models/User.js';
import { AppError, forbidden } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import { clearAuthCookies, revokeAllSessions } from '../services/sessionService.js';
import { anonymizeUser, verifyPassword } from '../services/userService.js';

async function confirmPassword(userId, password) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Password is incorrect');
  }
  return user;
}

export async function updateMe(req, res) {
  const { name, phone } = req.valid.body;
  const update = {};
  const unset = {};
  if (name !== undefined) update.name = name;
  if (phone === null) unset.phone = '';
  else if (phone !== undefined) update.phone = phone;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      ...(Object.keys(update).length ? { $set: update } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
    { new: true, runValidators: true },
  );
  await audit(req, 'user.profile_updated', { target: { type: 'User', id: user._id } });
  res.json({ user });
}

export async function deactivateMe(req, res) {
  if (req.user.role === 'admin') throw forbidden('Admin accounts cannot be deactivated here');
  const user = await confirmPassword(req.user._id, req.valid.body.password);
  await User.updateOne({ _id: user._id }, { status: 'deactivated' });
  await revokeAllSessions(user._id);
  await audit(req, 'user.deactivated', { target: { type: 'User', id: user._id } });
  clearAuthCookies(res);
  res.json({ ok: true });
}

// Buyers may delete (anonymise) their own account. Vendors and delivery agents hold
// financial obligations, so their closure goes through an Admin-controlled workflow.
export async function deleteMe(req, res) {
  if (req.user.role !== 'buyer') {
    throw forbidden(
      'Vendor and delivery accounts are closed through support',
      'DELETION_NOT_ALLOWED',
    );
  }
  const user = await confirmPassword(req.user._id, req.valid.body.password);
  await anonymizeUser(user);
  await audit(req, 'user.deleted', { actor: req.user, target: { type: 'User', id: user._id } });
  clearAuthCookies(res);
  res.json({ ok: true });
}
