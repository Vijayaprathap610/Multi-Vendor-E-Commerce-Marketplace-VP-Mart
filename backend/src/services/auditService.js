import AuditLog from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

export async function audit(req, action, { target, metadata, actor } = {}) {
  try {
    const who = actor || req?.user;
    await AuditLog.create({
      actorId: who?._id || who?.id,
      actorRole: who?.role,
      action,
      targetType: target?.type,
      targetId: target?.id ? String(target.id) : undefined,
      metadata,
      ip: req?.ip,
    });
  } catch (err) {
    // Audit failure must be visible but must not break the user's request.
    logger.error({ err, action }, 'audit log write failed');
  }
}
