// Creates or updates the Admin account.
// Run explicitly: npm run seed:admin
// Or pass arguments: node src/scripts/seedAdmin.js <email> <password> <name>
import env from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import User from '../models/User.js';
import { hashPassword } from '../services/userService.js';
import { passwordRule } from '../validators/auth.js';

// Parse CLI arguments if provided
function parseArgs() {
  const args = process.argv.slice(2);
  let email = null;
  let password = null;
  let name = null;

  for (const arg of args) {
    if (arg.startsWith('--email=')) email = arg.split('=')[1];
    else if (arg.startsWith('--password=')) password = arg.split('=')[1];
    else if (arg.startsWith('--name=')) name = arg.split('=')[1];
    else if (!email && arg.includes('@')) email = arg;
    else if (!password && email) password = arg;
    else if (!name && password) name = arg;
  }

  return {
    email: email || env.ADMIN_EMAIL,
    password: password || env.ADMIN_PASSWORD,
    name: name || env.ADMIN_NAME || 'VP Mart Admin',
  };
}

async function run() {
  const { email, password, name } = parseArgs();

  if (!email || !password) {
    throw new Error(
      'Missing admin credentials. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env or pass as arguments:\n' +
      '  node src/scripts/seedAdmin.js <email> <password> "<name>"'
    );
  }

  const check = passwordRule.safeParse(password);
  if (!check.success) {
    throw new Error(`Password rejected: ${check.error.issues[0].message} (minimum 10 characters, letters and numbers)`);
  }

  await connectDb();
  await User.init();

  const targetEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: targetEmail });
  const passwordHash = await hashPassword(password);

  if (existing) {
    existing.name = name;
    existing.role = 'admin';
    existing.status = 'active';
    existing.passwordHash = passwordHash;
    existing.passwordChangedAt = new Date();
    await existing.save();
    console.log(`\n=========================================`);
    console.log(`✓ Admin account updated successfully!`);
    console.log(`  Name:     ${name}`);
    console.log(`  Email:    ${targetEmail}`);
    console.log(`  Role:     admin`);
    console.log(`  Status:   active`);
    console.log(`=========================================\n`);
  } else {
    await User.create({
      name,
      email: targetEmail,
      role: 'admin',
      status: 'active',
      passwordHash,
      passwordChangedAt: new Date(),
    });
    console.log(`\n=========================================`);
    console.log(`✓ Admin account created successfully!`);
    console.log(`  Name:     ${name}`);
    console.log(`  Email:    ${targetEmail}`);
    console.log(`  Role:     admin`);
    console.log(`  Status:   active`);
    console.log(`=========================================\n`);
  }

  console.log(`You can now log in at http://localhost:5173/login with:`);
  console.log(`  Email:    ${targetEmail}`);
  console.log(`  Password: (the password you provided)\n`);

  await disconnectDb();
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
