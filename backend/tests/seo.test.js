import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {
  PASSWORD,
  createApp,
  makeListing,
  makeUser,
  makeVendor,
  models,
  newClient,
  resetDb,
  seedCategories,
  setupDb,
  teardownDb,
} from './helpers.js';

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

describe('sitemap, robots and server-rendered pages', () => {
  it('lists public pages, active categories and public listings only', async () => {
    const v = await makeVendor();
    const ok = await makeListing(v, { name: 'Visible Tee' });
    const hidden = await makeListing(v, { name: 'Hidden Tee' });
    await models.Listing.updateOne({ _id: hidden._id }, { status: 'hidden', isPublic: false });
    const res = await request(app).get('/sitemap.xml');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /xml/);
    assert.ok(res.text.includes('http://localhost:5173/c/fashion'));
    assert.ok(res.text.includes(`/product/${ok._id}/`));
    assert.ok(!res.text.includes(String(hidden._id)));
    assert.ok(res.text.includes('<loc>http://localhost:5173/</loc>'));
  });

  it('renders a crawler-friendly product page with canonical URL and Product structured data', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, {
      name: 'Linen Shirt',
      brand: 'Acme',
      pricePaise: 49900,
      mrpPaise: 60000,
      stock: 3,
    });
    const res = await request(app).get(`/seo/product/${l._id}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /<title>Linen Shirt \| VP Mart<\/title>/);
    assert.ok(
      res.text.includes(
        `rel="canonical" href="http://localhost:5173/product/${l._id}/linen-shirt"`,
      ),
    );
    const ld = JSON.parse(
      res.text.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1],
    );
    assert.equal(ld['@type'], 'Product');
    assert.equal(ld.offers.price, '499.00');
    assert.equal(ld.offers.priceCurrency, 'INR');
    assert.equal(ld.offers.availability, 'https://schema.org/InStock');
    assert.equal(ld.brand.name, 'Acme');
    await models.Listing.updateOne({ _id: l._id }, { stock: 0 });
    assert.match((await request(app).get(`/seo/product/${l._id}`)).text, /OutOfStock/);
  });

  it('escapes hostile text in rendered pages', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { name: 'Bad </script><img src=x onerror=alert(1)>' });
    const res = await request(app).get(`/seo/product/${l._id}`);
    assert.ok(!res.text.includes('</script><img'));
    assert.ok(!res.text.includes('<img src=x'));
  });

  it('404s for hidden or unknown products and categories; renders a category page', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { name: 'Cat Page Tee' });
    assert.equal((await request(app).get('/seo/product/64b000000000000000000000')).status, 404);
    assert.equal((await request(app).get('/seo/c/does-not-exist')).status, 404);
    const cat = await request(app).get('/seo/c/fashion');
    assert.equal(cat.status, 200);
    assert.ok(cat.text.includes('Cat Page Tee'));
    await models.Listing.updateOne({ _id: l._id }, { isPublic: false });
    assert.equal((await request(app).get(`/seo/product/${l._id}`)).status, 404);
  });

  it('serves robots.txt that keeps the API out of search indexes', async () => {
    const res = await request(app).get('/robots.txt');
    assert.match(res.text, /Disallow: \/api\//);
    assert.match(res.text, /Sitemap: /);
  });
});

describe('contact form and admin overview', () => {
  it('stores messages, validates input, and lets only admins read and resolve them', async () => {
    const c = newClient(app);
    assert.equal(
      (
        await c.post('/api/contact', {
          name: 'Asha',
          email: 'asha@example.com',
          subject: 'Order help',
          message: 'Where is my parcel please?',
        })
      ).status,
      201,
    );
    assert.equal(
      (await c.post('/api/contact', { name: 'A', email: 'bad', message: 'short' })).status,
      422,
    );
    assert.equal(await models.ContactMessage.countDocuments(), 1);
    assert.equal((await c.get('/api/admin/messages')).status, 401);
    const admin = newClient(app);
    await admin.login((await makeUser({ role: 'admin' })).email, PASSWORD);
    const list = await admin.get('/api/admin/messages');
    assert.equal(list.body.items[0].email, 'asha@example.com');
    assert.equal(
      (await admin.patch(`/api/admin/messages/${list.body.items[0].id}/resolve`)).body.message
        .status,
      'resolved',
    );
  });

  it('rate-limits the public contact form per IP', async () => {
    const limited = newClient(createApp({ strictLimit: 2 }));
    const body = { name: 'Asha', email: 'asha@example.com', message: 'Hello there, I need help.' };
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await limited.post('/api/contact', body)).status);
    assert.deepEqual(codes, [201, 201, 429, 429]);
  });

  it('admin overview distinguishes unique products, listings, stock and units sold from real rows', async () => {
    const v1 = await makeVendor({ shop: 'One' });
    const v2 = await makeVendor({ shop: 'Two' });
    await makeListing(v1, { name: 'Same Thing', brand: 'B', sku: 'A', stock: 5 });
    await makeListing(v2, { name: 'Same Thing', brand: 'B', sku: 'B', stock: 7 });
    await makeListing(v2, { name: 'Other Thing', brand: 'B', sku: 'C', stock: 0 });
    const admin = newClient(app);
    await admin.login((await makeUser({ role: 'admin' })).email, PASSWORD);
    const { body } = await admin.get('/api/admin/stats/overview');
    assert.equal(body.catalog.listings, 3);
    assert.equal(body.catalog.uniqueProducts, 2);
    assert.equal(body.catalog.stockUnits, 12);
    assert.equal(body.catalog.outOfStock, 1);
    assert.equal(body.catalog.categories, 18);
    assert.equal(body.users.vendor.active, 2);
    const buyer = newClient(app);
    await buyer.login((await makeUser()).email, PASSWORD);
    assert.equal((await buyer.get('/api/admin/stats/overview')).status, 403);
  });
});
