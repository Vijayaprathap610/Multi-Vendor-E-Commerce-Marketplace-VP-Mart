import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import env from '../config/env.js';
import User from '../models/User.js';
import { conflict } from '../utils/AppError.js';
import { revokeAllSessions } from './sessionService.js';

export const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Real hash computed once and compared when an email is unknown, so response time does not
// reveal whether an account exists.
let dummyHash;
export async function dummyCompare(plain) {
  dummyHash ??= await hashPassword(crypto.randomBytes(16).toString('hex'));
  await bcrypt.compare(plain, dummyHash);
}

// Records that must block account deletion. Orders, payments, settlements and disputes do
// not exist yet; this function is the single place those checks get added in later phases.
export async function findDeletionBlockers(_user) {
  return [];
}

// Anonymises instead of removing the document so future order/financial history keeps a
// valid reference while personal data is erased.
export async function anonymizeUser(user) {
  const blockers = await findDeletionBlockers(user);
  if (blockers.length) {
    throw conflict(`Account cannot be deleted yet: ${blockers.join(', ')}`, 'DELETION_BLOCKED');
  }
  const id = String(user._id);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        name: 'Deleted User',
        email: `deleted+${id}@deleted.invalid`,
        status: 'deleted',
        deletedAt: new Date(),
        passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
      },
      $unset: { phone: '', resetTokenHash: '', resetTokenExpires: '', lockUntil: '' },
    },
  );
  await revokeAllSessions(user._id);
}
