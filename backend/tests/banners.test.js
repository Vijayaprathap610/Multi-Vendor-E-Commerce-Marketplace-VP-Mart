import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PASSWORD,
  createApp,
  makePng,
  makeUser,
  makeVendor,
  models,
  newClient,
  resetDb,
  setupDb,
  teardownDb,
} from './helpers.js';

let app;
before(async () => {
  await setupDb();
  app = createApp();
});
after(teardownDb);
beforeEach(resetDb);

const admin = async () => {
  const u = await makeUser({ role: 'admin' });
  const c = newClient(app);
  await c.login(u.email, PASSWORD);
  return c;
};
const day = 86400000;
const iso = (offset) => new Date(Date.now() + offset * day).toISOString();
const exists = (key) =>
  fs.access(path.join(process.env.UPLOAD_DIR, key)).then(
    () => true,
    () => false,
  );
async function newBanner(c, over = {}) {
  const up = await c.upload('/api/uploads/image?purpose=banner', await makePng(1200, 400));
  const res = await c.post('/api/admin/banners', {
    title: 'Diwali Sale',
    description: 'Up to 40% off',
    ctaLabel: 'Shop now',
    destination: '/search?sort=newest',
    startAt: iso(-1),
    endAt: iso(5),
    imageKey: up.body.key,
    ...over,
  });
  return { res, key: up.body.key };
}
const live = async () => (await newClient(app).get('/api/catalog/banners')).body.items;

describe('banner scheduling and public visibility', () => {
  it('shows only active banners inside their date window', async () => {
    const c = await admin();
    await newBanner(c, { title: 'Live now' });
    await newBanner(c, { title: 'Scheduled', startAt: iso(2), endAt: iso(9) });
    await newBanner(c, { title: 'Expired', startAt: iso(-9), endAt: iso(-2) });
    await newBanner(c, { title: 'Switched off', isActive: false });
    assert.deepEqual(
      (await live()).map((b) => b.title),
      ['Live now'],
    );
    const all = (await c.get('/api/admin/banners')).body.items;
    assert.equal(all.length, 4);
    assert.deepEqual(
      all.filter((b) => b.live).map((b) => b.title),
      ['Live now'],
    );
  });

  it('orders by sortOrder and exposes only public fields', async () => {
    const c = await admin();
    await newBanner(c, { title: 'Second', sortOrder: 2 });
    await newBanner(c, { title: 'First', sortOrder: 1 });
    const items = await live();
    assert.deepEqual(
      items.map((b) => b.title),
      ['First', 'Second'],
    );
    assert.ok(!('clicks' in items[0]) && !('createdBy' in items[0]));
  });

  it('counts clicks only on live banners', async () => {
    const c = await admin();
    const { res } = await newBanner(c);
    const id = res.body.banner._id;
    assert.equal((await newClient(app).post(`/api/catalog/banners/${id}/click`)).status, 204);
    assert.equal((await models.Banner.findById(id)).clicks, 1);
    await c.patch(`/api/admin/banners/${id}`, { isActive: false });
    assert.equal((await newClient(app).post(`/api/catalog/banners/${id}/click`)).status, 404);
  });
});

describe('banner validation and permissions', () => {
  it('accepts only safe destinations and sane dates', async () => {
    const c = await admin();
    for (const bad of [
      'javascript:alert(1)',
      '//evil.example',
      'http://insecure.example',
      'data:text/html,x',
      'c/electronics',
    ]) {
      assert.equal((await newBanner(c, { destination: bad })).res.status, 422, bad);
    }
    for (const good of ['/c/electronics', 'https://example.com/offer'])
      assert.equal((await newBanner(c, { destination: good })).res.status, 201, good);
    assert.equal((await newBanner(c, { startAt: iso(3), endAt: iso(1) })).res.status, 422);
    assert.equal((await newBanner(c, { title: 'x' })).res.status, 422);
  });

  it('is admin-only and cannot use an image that was not uploaded for banners by an admin', async () => {
    const buyer = newClient(app);
    await buyer.login((await makeUser()).email, PASSWORD);
    assert.equal((await buyer.post('/api/admin/banners', {})).status, 403);
    assert.equal((await newClient(app).get('/api/admin/banners')).status, 401);
    const vendor = await makeVendor();
    const vc = newClient(app);
    await vc.login(vendor.email, PASSWORD);
    const vendorImage = await vc.upload('/api/uploads/image?purpose=logo', await makePng());
    const c = await admin();
    const r = await c.post('/api/admin/banners', {
      title: 'Sneaky',
      destination: '/',
      startAt: iso(-1),
      endAt: iso(1),
      imageKey: vendorImage.body.key,
    });
    assert.equal(r.status, 403);
    assert.equal(
      (
        await c.post('/api/admin/banners', {
          title: 'No image',
          destination: '/',
          startAt: iso(-1),
          endAt: iso(1),
          imageKey: 'banner/x/none.webp',
        })
      ).status,
      403,
    );
  });
});

describe('advertisement deletion is real', () => {
  it('removes the database record, stops showing it, deletes the image and reports accurately', async () => {
    const c = await admin();
    const { res, key } = await newBanner(c);
    const id = res.body.banner._id;
    assert.equal((await live()).length, 1);
    assert.equal(await exists(key), true);

    const del = await c.del(`/api/admin/banners/${id}`);
    assert.equal(del.status, 200);
    assert.deepEqual(del.body, { deleted: true, image: 'deleted' });
    assert.equal(
      await models.Banner.countDocuments({ _id: id }),
      0,
      'database record is gone, not just hidden',
    );
    assert.equal((await live()).length, 0);
    assert.equal(await exists(key), false, 'image removed from storage');
    assert.equal(await models.MediaAsset.countDocuments({ key }), 0);
    const log = await models.AuditLog.findOne({ action: 'banner.deleted' });
    assert.equal(log.targetId, id);
    assert.equal((await c.del(`/api/admin/banners/${id}`)).status, 404);
  });

  it('keeps an image that another resource still uses', async () => {
    const c = await admin();
    const { res: a, key } = await newBanner(c, { title: 'Banner A' });
    const b = await c.post('/api/admin/banners', {
      title: 'B copy',
      destination: '/',
      startAt: iso(-1),
      endAt: iso(2),
      imageKey: key,
    });
    assert.equal(b.status, 201);
    const del = await c.del(`/api/admin/banners/${a.body.banner._id}`);
    assert.deepEqual(del.body, { deleted: true, image: 'still-referenced' });
    assert.equal(await exists(key), true);
    assert.equal((await live()).length, 1);
    await c.del(`/api/admin/banners/${b.body.banner._id}`);
    assert.equal(await exists(key), false);
  });

  it('replacing a banner image cleans up the old one', async () => {
    const c = await admin();
    const { res, key } = await newBanner(c);
    const up2 = await c.upload(
      '/api/uploads/image?purpose=banner',
      await makePng(900, 300, '#1b4fd8'),
    );
    const upd = await c.patch(`/api/admin/banners/${res.body.banner._id}`, {
      imageKey: up2.body.key,
      title: 'New look',
    });
    assert.equal(upd.status, 200);
    assert.equal(await exists(key), false);
    assert.equal(await exists(up2.body.key), true);
    assert.equal((await live())[0].title, 'New look');
  });

  it('non-admins cannot delete banners', async () => {
    const c = await admin();
    const { res } = await newBanner(c);
    const buyer = newClient(app);
    await buyer.login((await makeUser()).email, PASSWORD);
    assert.equal((await buyer.del(`/api/admin/banners/${res.body.banner._id}`)).status, 403);
    assert.equal(await models.Banner.countDocuments(), 1);
  });
});
