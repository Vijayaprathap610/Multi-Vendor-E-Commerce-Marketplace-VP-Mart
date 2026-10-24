import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import {
  PASSWORD,
  createApp,
  makeListing,
  makePng,
  makeUser,
  makeVendor,
  models,
  newClient,
  resetDb,
  seedCategories,
  setupDb,
  teardownDb,
} from './helpers.js';
import { cleanupUnattached, isReferenced, releaseImage } from '../src/services/media.js';
import { makeS3Driver } from '../src/services/storage.js';

let app;
before(async () => {
  await setupDb();
  app = createApp();
});
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  await seedCategories();
});

const as = async (u) => {
  const c = newClient(app);
  assert.equal((await c.login(u.email, PASSWORD)).status, 200);
  return c;
};
const onDisk = (key) => path.join(process.env.UPLOAD_DIR, key);
const exists = (key) =>
  fs.access(onDisk(key)).then(
    () => true,
    () => false,
  );

describe('image upload pipeline', () => {
  it('re-encodes to WebP, creates a thumbnail, stores both and serves them cross-origin', async () => {
    const v = await makeVendor();
    const c = await as(v);
    const res = await c.upload(
      '/api/uploads/image?purpose=listing',
      await makePng(2400, 1200),
      'photo.png',
    );
    assert.equal(res.status, 201);
    assert.match(res.body.key, new RegExp(`^listing/${v._id}/[0-9a-f-]{36}\\.webp$`));
    const main = await sharp(await fs.readFile(onDisk(res.body.key))).metadata();
    assert.equal(main.format, 'webp');
    assert.equal(main.width, 1600);
    const thumb = await sharp(
      await fs.readFile(onDisk(res.body.key.replace('.webp', '.thumb.webp'))),
    ).metadata();
    assert.equal(thumb.width, 400);
    const served = await request(app).get(`/uploads/${res.body.key}`);
    assert.equal(served.status, 200);
    assert.equal(served.headers['content-type'], 'image/webp');
    assert.equal(served.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.equal(served.headers['x-content-type-options'], 'nosniff');
    const asset = await models.MediaAsset.findOne({ key: res.body.key });
    assert.equal(String(asset.ownerId), String(v._id));
    assert.equal(asset.attachedAt, undefined);
  });

  it('rejects non-images, disguised files, unsupported formats and decompression bombs', async () => {
    const c = await as(await makeVendor());
    const up = (buf, name) => c.upload('/api/uploads/image?purpose=listing', buf, name);
    const text = await up(Buffer.from('<?php echo 1; ?>'), 'shell.png');
    assert.equal(text.status, 415);
    assert.equal(text.body.error.code, 'BAD_IMAGE');
    const svg = await up(
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      'x.png',
    );
    assert.equal(svg.status, 415);
    const gif = await up(
      await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
        .gif()
        .toBuffer(),
      'x.gif',
    );
    assert.equal(gif.status, 415);
    assert.equal(gif.body.error.code, 'BAD_IMAGE_TYPE');
    const bomb = await sharp(Buffer.alloc(6600 * 6600), {
      raw: { width: 6600, height: 6600, channels: 1 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    assert.equal((await up(bomb, 'bomb.png')).status, 415);
    assert.equal(await models.MediaAsset.countDocuments(), 0, 'nothing stored for rejected files');
  });

  it('enforces the 5 MB size limit and requires a file', async () => {
    const c = await as(await makeVendor());
    const big = await c.upload(
      '/api/uploads/image?purpose=listing',
      Buffer.alloc(6 * 1024 * 1024, 1),
      'big.png',
    );
    assert.equal(big.status, 413);
    assert.equal(big.body.error.code, 'FILE_TOO_LARGE');
    if (!c.csrf) await c.get('/api/auth/csrf');
    const none = await c.agent
      .post('/api/uploads/image?purpose=listing')
      .set('x-csrf-token', c.csrf);
    assert.equal(none.status, 422);
  });

  it('restricts who can upload what', async () => {
    const png = await makePng();
    const vendor = await as(await makeVendor());
    const pendingVendor = await as(await makeVendor({ approved: false }));
    const admin = await as(await makeUser({ role: 'admin' }));
    const buyer = await as(await makeUser());
    assert.equal((await vendor.upload('/api/uploads/image?purpose=banner', png)).status, 403);
    assert.equal((await admin.upload('/api/uploads/image?purpose=listing', png)).status, 403);
    assert.equal((await buyer.upload('/api/uploads/image?purpose=listing', png)).status, 403);
    assert.equal(
      (await pendingVendor.upload('/api/uploads/image?purpose=listing', png)).status,
      403,
    );
    assert.equal((await pendingVendor.upload('/api/uploads/image?purpose=logo', png)).status, 201);
    assert.equal((await admin.upload('/api/uploads/image?purpose=banner', png)).status, 201);
    assert.equal((await vendor.upload('/api/uploads/image?purpose=hacks', png)).status, 422);
    assert.equal(
      (await newClient(app).upload('/api/uploads/image?purpose=listing', png)).status,
      401,
    );
  });

  it('never lets a crafted key escape the upload directory', async () => {
    const res = await request(app).get('/uploads/..%2f..%2fetc%2fpasswd');
    assert.notEqual(res.status, 200);
    const res2 = await request(app).get('/uploads/%2e%2e/%2e%2e/etc/passwd');
    assert.notEqual(res2.status, 200);
  });
});

describe('image lifecycle and orphan cleanup', () => {
  it('deletes an image from storage when its last reference is removed, and keeps shared ones', async () => {
    const v = await makeVendor();
    const c = await as(v);
    const up = await c.upload('/api/uploads/image?purpose=listing', await makePng());
    const l = await makeListing(v);
    const a = await c.patch(`/api/vendor/listings/${l._id}`, {
      images: [{ key: up.body.key, alt: 'x' }],
    });
    assert.equal(a.status, 200);
    assert.equal(await isReferenced(up.body.key), true);
    assert.deepEqual(await releaseImage(up.body.key), {
      deleted: false,
      reason: 'still-referenced',
    });
    assert.equal(await exists(up.body.key), true);
    assert.equal((await c.patch(`/api/vendor/listings/${l._id}`, { images: [] })).status, 200);
    assert.equal(await exists(up.body.key), false, 'orphaned object removed');
    assert.equal(await exists(up.body.key.replace('.webp', '.thumb.webp')), false);
    assert.equal(await models.MediaAsset.countDocuments({ key: up.body.key }), 0);
  });

  it('cleanup removes only old unattached uploads', async () => {
    const v = await makeVendor();
    const c = await as(v);
    const old = await c.upload('/api/uploads/image?purpose=listing', await makePng());
    const fresh = await c.upload('/api/uploads/image?purpose=listing', await makePng());
    const attached = await c.upload('/api/uploads/image?purpose=listing', await makePng());
    const l = await makeListing(v);
    await c.patch(`/api/vendor/listings/${l._id}`, { images: [{ key: attached.body.key }] });
    const past = new Date(Date.now() - 48 * 3600 * 1000);
    await models.MediaAsset.collection.updateOne(
      { key: old.body.key },
      { $set: { createdAt: past } },
    );
    await models.MediaAsset.collection.updateOne(
      { key: attached.body.key },
      { $set: { createdAt: past } },
    );
    const r = await cleanupUnattached(24);
    assert.equal(r.deleted, 1);
    assert.equal(await exists(old.body.key), false);
    assert.equal(await exists(fresh.body.key), true);
    assert.equal(await exists(attached.body.key), true);
  });
});

describe('S3 storage driver', () => {
  it('sends correctly addressed PutObject/DeleteObject commands and builds public URLs', async () => {
    // A recording stand-in for the AWS client: this verifies our request construction only.
    // It does NOT prove behaviour against a real bucket.
    const sent = [];
    const fake = {
      send: async (cmd) => {
        sent.push({ type: cmd.constructor.name, input: cmd.input });
        return {};
      },
    };
    const s3 = makeS3Driver(fake, {
      S3_BUCKET: 'vp-bucket',
      S3_PUBLIC_BASE_URL: 'https://cdn.example.com/',
    });
    await s3.put('listing/u/x.webp', Buffer.from('img'), 'image/webp');
    await s3.remove('listing/u/x.webp');
    assert.equal(sent[0].type, 'PutObjectCommand');
    assert.equal(sent[0].input.Bucket, 'vp-bucket');
    assert.equal(sent[0].input.Key, 'listing/u/x.webp');
    assert.equal(sent[0].input.ContentType, 'image/webp');
    assert.match(sent[0].input.CacheControl, /immutable/);
    assert.equal(sent[1].type, 'DeleteObjectCommand');
    assert.equal(s3.urlFor('listing/u/x.webp'), 'https://cdn.example.com/listing/u/x.webp');
    assert.equal(sent[0].input.ACL, undefined, 'no per-object ACL; access is by bucket policy');
  });
});
