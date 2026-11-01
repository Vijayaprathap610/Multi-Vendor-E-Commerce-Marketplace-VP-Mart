import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';

// Notifications are stored in the database (the source of truth). Real-time delivery over
// Socket.IO is layered on top and can be added without changing callers.
let emitter = null;
export const setNotificationEmitter = (fn) => {
  emitter = fn;
};

export async function notify(userId, { type, title, body, data }, { session } = {}) {
  try {
    const [n] = await Notification.create(
      [{ userId, type, title, body, data }],
      session ? { session } : undefined,
    );
    emitter?.(String(userId), n);
    return n;
  } catch (err) {
    logger.error({ err, type }, 'notification failed');
    return null;
  }
}

export async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin', status: 'active' }).select('_id').lean();
  return Promise.all(admins.map((a) => notify(a._id, payload)));
}

export const view = (n) => ({
  id: String(n._id),
  type: n.type,
  title: n.title,
  body: n.body,
  data: n.data,
  read: !!n.readAt,
  createdAt: n.createdAt,
});
