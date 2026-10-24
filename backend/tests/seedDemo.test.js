import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createApp,
  models,
  newClient,
  resetDb,
  seedCategories,
  setupDb,
  teardownDb,
} from './helpers.js';
import { DEMO_PASSWORD, seedDemo } from '../src/services/seedDemo.js';

before(setupDb);
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedCategories();
});

describe('demo seed', () => {
  it('creates a browsable catalogue across all 18 categories with consistent ratings', async () => {
    const r = await seedDemo();
    assert.ok(r.listings >= 30 && r.vendors === 4 && r.banners === 3);
    assert.equal(await models.Listing.countDocuments({ isPublic: true }), r.listings);
    const covered = await models.Listing.distinct('categoryPath', {});
    const tops = await models.Category.find({ parent: null }).select('_id').lean();
    for (const t of tops)
      assert.ok(
        covered.some((c) => String(c) === String(t._id)),
        'every top category has a listing',
      );
    for (const l of await models.Listing.find({ ratingCount: { $gt: 0 } }).lean()) {
      const rows = await models.Review.find({ listingId: l._id }).lean();
      assert.equal(rows.length, l.ratingCount);
      const avg = Math.round((rows.reduce((s, x) => s + x.rating, 0) / rows.length) * 10) / 10;
      assert.equal(l.ratingAvg, avg);
    }
    const res = await newClient(createApp()).get('/api/catalog/home');
    assert.ok(
      res.body.newArrivals.length > 0 &&
        res.body.todaysDeals.length > 0 &&
        res.body.popularBrands.length > 0,
    );
    assert.equal((await newClient(createApp()).get('/api/catalog/banners')).body.items.length, 3);
  });

  it('is idempotent, and demo accounts can sign in', async () => {
    await seedDemo();
    const n = await models.Listing.countDocuments();
    assert.equal((await seedDemo()).skipped, true);
    assert.equal(await models.Listing.countDocuments(), n);
    const c = newClient(createApp());
    assert.equal((await c.login('demo.v1@vpmart.example', DEMO_PASSWORD)).status, 200);
  });

  it('refuses to run in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await assert.rejects(seedDemo(), /production/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
