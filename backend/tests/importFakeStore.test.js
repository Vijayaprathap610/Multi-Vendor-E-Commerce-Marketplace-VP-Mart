import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createApp,
  makePng,
  models,
  newClient,
  resetDb,
  seedCategories,
  setupDb,
  teardownDb,
} from './helpers.js';
import { importFakeStore } from '../src/services/importFakeStore.js';

let server;
let base;
let png;
before(async () => {
  await setupDb();
  png = await makePng(300, 300, '#1b4fd8');
  server = http.createServer((req, res) => {
    if (req.url === '/products') {
      res.setHeader('content-type', 'application/json');
      return res.end(
        JSON.stringify([
          {
            id: 1,
            title: 'Mens Cotton Jacket',
            price: 10.5,
            description: 'Warm jacket',
            category: "men's clothing",
            image: `${base}/img/ok.png`,
          },
          {
            id: 2,
            title: 'Gold Ring',
            price: 50,
            description: 'Shiny',
            category: 'jewelery',
            image: `${base}/img/missing.png`,
          },
          {
            id: 3,
            title: 'USB Drive',
            price: 20,
            description: 'Fast',
            category: 'electronics',
            image: `${base}/img/ok.png`,
          },
          {
            id: 4,
            title: 'Broken record',
            price: -5,
            category: "women's clothing",
            image: 'not a url',
          },
          {
            id: 5,
            title: 'Mystery Item',
            price: 5,
            description: 'x',
            category: 'furniture-unknown',
            image: `${base}/img/ok.png`,
          },
          {
            id: 6,
            title: 'Not An Image',
            price: 7,
            description: 'x',
            category: "women's clothing",
            image: `${base}/img/page.html`,
          },
        ]),
      );
    }
    if (req.url === '/img/ok.png') {
      res.setHeader('content-type', 'image/png');
      return res.end(png);
    }
    if (req.url === '/img/page.html') {
      res.setHeader('content-type', 'text/html');
      return res.end('<html></html>');
    }
    res.statusCode = req.url === '/bad' ? 500 : 404;
    res.end('nope');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await teardownDb();
  await new Promise((r) => server.close(r));
});
beforeEach(async () => {
  await resetDb();
  await seedCategories();
});
const run = () => importFakeStore({ url: `${base}/products`, usdToInr: 80, allowHttp: true });

describe('Fake Store sample import', () => {
  it('validates, maps categories, converts prices and reports every outcome', async () => {
    const r = await run();
    assert.equal(r.fetched, 6);
    assert.equal(r.imported, 4);
    assert.equal(r.failed, 2);
    assert.equal(r.imageFailed, 2);
    assert.equal(r.vendorListingsInDb, 4);
    assert.ok(r.errors.some((e) => e.includes('record 4')));
    assert.ok(r.errors.some((e) => e.includes('unmapped category')));
    const jacket = await models.Listing.findOne({ sku: 'FS-1' });
    assert.equal(jacket.pricePaise, 84000, '10.50 USD x 80 = 840 INR');
    assert.equal(jacket.categorySlug, 'mens-clothing');
    assert.equal(jacket.images.length, 1);
    assert.equal(jacket.isPublic, true);
    assert.equal(
      (await models.Listing.findOne({ sku: 'FS-2' })).images.length,
      0,
      'unavailable image: listing kept, no image',
    );
    assert.equal(
      (await models.Listing.findOne({ sku: 'FS-3' })).categorySlug,
      'electronic-accessories',
    );
  });

  it('is idempotent: a second run imports nothing and creates no duplicates', async () => {
    await run();
    const again = await run();
    assert.equal(again.imported, 0);
    assert.equal(again.skipped, 4);
    assert.equal(await models.Listing.countDocuments(), 4);
    assert.equal(await models.User.countDocuments({ role: 'vendor' }), 1);
    assert.equal(await models.Product.countDocuments(), 4);
  });

  it('imported products appear on the storefront, with no invented ratings', async () => {
    await run();
    const res = await newClient(createApp()).get('/api/catalog/search?q=jacket');
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].ratingCount, 0);
    assert.equal(await models.Review.countDocuments(), 0);
  });

  it('fails clearly when the API is unavailable or categories are not seeded', async () => {
    await assert.rejects(importFakeStore({ url: `${base}/bad`, allowHttp: true }), /HTTP 500/);
    await models.Category.deleteMany({});
    const r = await run();
    assert.equal(r.imported, 0);
    assert.ok(r.errors.some((e) => e.includes('seed:catalog')));
  });

  it('refuses plain-http image URLs unless explicitly allowed', async () => {
    const r = await importFakeStore({ url: `${base}/products`, usdToInr: 80, allowHttp: false });
    assert.equal(r.imageFailed, 4);
    assert.ok(r.errors.some((e) => e.includes('https')));
  });
});
