// npm run seed:demo : DEMO data for local previews (never in production). Run seed:catalog first.
// Demo logins (all use the same documented demo password): see README.
import { runScript } from './run.js';
import { DEMO_PASSWORD, seedDemo } from '../services/seedDemo.js';

runScript(async () => {
  const r = await seedDemo();
  if (r.skipped) return console.log('Demo listings already exist; nothing to do.');
  console.log(
    `Demo data created: ${r.vendors} vendors, ${r.listings} listings, ${r.reviews} reviews, ${r.banners} banners.`,
  );
  console.log(
    `Demo accounts (password ${DEMO_PASSWORD}): demo.v1@vpmart.example (vendor) ... demo.v4@vpmart.example, demo.asha@vpmart.example (buyer)`,
  );
});
