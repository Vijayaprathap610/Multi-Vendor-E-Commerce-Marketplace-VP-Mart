// Used only by the Playwright E2E suite (see e2e/playwright.config.js). Refuses to touch any
// database whose name does not contain "vpmart_e2e".
// Runs before the E2E API starts: wipes the E2E database, creates the categories and the admin.
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { connectDb } from '../config/db.js';
import { User, allModels } from '../models/index.js';
import { seedCategories } from '../services/seedCatalog.js';
import { flushForTests, closeRedis } from '../services/cache.js';
import { hashPassword } from '../services/userService.js';

if (!/vpmart_e2e/.test(env.MONGODB_URI))
  throw new Error('Refusing to reset a database that is not the E2E database');
await connectDb();
await mongoose.connection.dropDatabase();
await Promise.all(allModels.map((m) => m.init()));
await fs.rm(env.UPLOAD_DIR, { recursive: true, force: true });
await flushForTests();
await seedCategories();
await User.create({
  name: 'E2E Admin',
  email: env.ADMIN_EMAIL,
  role: 'admin',
  status: 'active',
  passwordHash: await hashPassword(env.ADMIN_PASSWORD),
  passwordChangedAt: new Date(),
});
await closeRedis();
await mongoose.disconnect();
console.log('E2E database prepared');
