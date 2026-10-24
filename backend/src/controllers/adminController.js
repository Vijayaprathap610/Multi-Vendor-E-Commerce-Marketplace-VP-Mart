import User from '../models/User.js';
import { AppError, notFound } from '../utils/AppError.js';
import { audit } from '../services/auditService.js';
import VendorProfile from '../models/VendorProfile.js';
import { onVendorStatusChange } from '../services/catalogService.js';
import { revokeAllSessions } from '../services/sessionService.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listUsers(req, res) {
  const { role, status, q, page, limit } = req.valid.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}

// Real counts straight from the database; nothing here is hardcoded.
export async function userStats(_req, res) {
  const rows = await User.aggregate([
    { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } },
  ]);
  const byRole = {};
  for (const { _id, count } of rows) {
    byRole[_id.role] ??= { total: 0 };
    byRole[_id.role][_id.status] = count;
    byRole[_id.role].total += count;
  }
  res.json({ byRole });
}

const ALLOWED_TRANSITIONS = {
  active: ['suspended'],
  pending_approval: ['active', 'rejected', 'suspended'],
  rejected: ['active'],
  suspended: ['active'],
  deactivated: ['active'],
};

const from0 = (u) => u.status;

export async function setUserStatus(req, res) {
  const { id } = req.valid.params;
  const { status, reason } = req.valid.body;
  const target = await User.findById(id);
  if (!target) throw notFound('User not found');
  if (String(target._id) === String(req.user._id)) {
    throw new AppError(400, 'SELF_ACTION', 'You cannot change your own status');
  }
  if (target.role === 'admin') {
    throw new AppError(403, 'ADMIN_PROTECTED', 'Admin accounts cannot be changed here');
  }
  if (!ALLOWED_TRANSITIONS[target.status]?.includes(status)) {
    throw new AppError(
      409,
      'BAD_TRANSITION',
      `Cannot change status from ${target.status} to ${status}`,
    );
  }
  if (target.role === 'vendor' && status === 'active' && from0(target) === 'pending_approval') {
    const profile = await VendorProfile.findOne({ userId: target._id });
    if (!profile?.submittedAt) {
      throw new AppError(
        409,
        'PROFILE_NOT_SUBMITTED',
        'The vendor has not submitted their shop profile for review yet',
      );
    }
  }
  const from = target.status;
  target.status = status;
  await target.save();
  if (target.role === 'vendor') await onVendorStatusChange(target._id, status === 'active');
  if (status !== 'active') await revokeAllSessions(target._id);
  await audit(req, 'admin.user_status_changed', {
    target: { type: 'User', id: target._id },
    metadata: { from, to: status, reason },
  });
  res.json({ user: target });
}
