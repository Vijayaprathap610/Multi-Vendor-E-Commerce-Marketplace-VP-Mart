// Creates the initial Admin. Run explicitly: npm run seed:admin
// Needs ADMIN_EMAIL and ADMIN_PASSWORD in the environment. Idempotent: never overwrites
// an existing account. There is intentionally no public Admin registration endpoint.
import env from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import User from '../models/User.js';
import { hashPassword } from '../services/userService.js';
import { passwordRule } from '../validators/auth.js';

async function run() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD before running the seed.');
  }
  const check = passwordRule.safeParse(env.ADMIN_PASSWORD);
  if (!check.success) throw new Error(`ADMIN_PASSWORD rejected: ${check.error.issues[0].message}`);

  await connectDb();
  await User.init();
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Admin seed skipped: ${email} already exists (role: ${existing.role}).`);
  } else {
    await User.create({
      name: env.ADMIN_NAME,
      email,
      role: 'admin',
      status: 'active',
      passwordHash: await hashPassword(env.ADMIN_PASSWORD),
      passwordChangedAt: new Date(),
    });
    console.log(`Admin created: ${email}`);
  }
  await disconnectDb();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
