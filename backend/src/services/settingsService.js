import env from '../config/env.js';
import Setting from '../models/Setting.js';

// Runtime settings an admin can change without a redeploy. Falls back to environment defaults.
export async function getCommissionPercent() {
  const s = await Setting.findOne({ key: 'commissionPercent' }).lean();
  return typeof s?.value === 'number' ? s.value : env.COMMISSION_PERCENT;
}

export async function setCommissionPercent(percent, adminId) {
  await Setting.updateOne(
    { key: 'commissionPercent' },
    { $set: { value: percent, updatedBy: adminId } },
    { upsert: true },
  );
  return percent;
}
