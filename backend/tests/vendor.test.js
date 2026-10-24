import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
  catByName,
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

const login = async (u) => {
  const c = newClient(app);
  assert.equal((await c.login(u.email, PASSWORD)).status, 200);
  return c;
};
const productBody = async (over = {}) => ({
  product: {
    name: 'Linen Shirt',
    brand: { name: 'Acme' },
    categoryId: String((await catByName('Fashion'))._id),
    ...over.product,
  },
  sku: over.sku ?? 'LS-1',
  pricePaise: 50000,
  mrpPaise: 60000,
  stock: 5,
  ...over.rest,
});

describe('vendor onboarding', () => {
  it('saves a profile, stores only the last 4 digits of the bank account, and masks it', async () => {
    const u = await makeUser({ role: 'vendor', status: 'pending_approval' });
    const c = await login(u);
    const res = await c.put('/api/vendor/profile', {
      shopName: 'Green Basket',
      businessName: 'Green Basket LLP',
      pickupAddress: {
        line1: '12 Mill Rd',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641001',
      },
      payout: { accountHolder: 'R Kumar', ifsc: 'hdfc0001234' },
      accountNumber: '123456789012',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.profile.payout.accountMasked, '••••9012');
    assert.ok(!JSON.stringify(res.body).includes('123456789012'));
    const stored = await models.VendorProfile.findOne({ userId: u._id }).lean();
    assert.equal(stored.payout.accountLast4, '9012');
    assert.ok(!JSON.stringify(stored).includes('123456789012'));
    assert.equal(stored.payout.ifsc, 'HDFC0001234');
    assert.match(stored.slug, /^green-basket/);
  });

  it('refuses submission until required sections are complete, then accepts it', async () => {
    const u = await makeUser({ role: 'vendor', status: 'pending_approval' });
    const c = await login(u);
    await c.put('/api/vendor/profile', { shopName: 'Half Done' });
    const bad = await c.post('/api/vendor/profile/submit');
    assert.equal(bad.status, 422);
    assert.ok(bad.body.error.details.pickupAddress && bad.body.error.details.payout);
    await c.put('/api/vendor/profile', {
      businessName: 'Half Done Pvt',
      pickupAddress: { line1: 'x road', city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
      payout: { accountHolder: 'Owner', ifsc: 'HDFC0001234' },
      accountNumber: '111122223333',
    });
    const ok = await c.post('/api/vendor/profile/submit');
    assert.equal(ok.status, 200);
    assert.ok(ok.body.profile.submittedAt);
  });

  it('rejects bad data: GSTIN, PIN, extra fields and role escalation attempts', async () => {
    const u = await makeUser({ role: 'vendor', status: 'pending_approval' });
    const c = await login(u);
    assert.equal((await c.put('/api/vendor/profile', { gstin: 'bad' })).status, 422);
    assert.equal(
      (await c.put('/api/vendor/profile', { pickupAddress: { pincode: '12' } })).status,
      422,
    );
    assert.equal(
      (await c.put('/api/vendor/profile', { userId: String(u._id), status: 'active' })).status,
      422,
    );
  });

  it('pending vendors cannot list products; buyers cannot use vendor routes', async () => {
    const pending = await makeVendor({ approved: false });
    assert.equal((await (await login(pending)).get('/api/vendor/listings')).status, 403);
    const buyer = await makeUser();
    assert.equal((await (await login(buyer)).get('/api/vendor/profile')).status, 403);
    assert.equal((await newClient(app).get('/api/vendor/profile')).status, 401);
  });

  it('admin reviews masked vendor details and can warn a vendor', async () => {
    const v = await makeVendor({ approved: false });
    const a = await makeUser({ role: 'admin' });
    const c = await login(a);
    const list = await c.get('/api/admin/vendors?submitted=true&status=pending_approval');
    assert.equal(list.body.total, 1);
    const detail = await c.get(`/api/admin/vendors/${v._id}`);
    assert.equal(detail.body.vendor.profile.payout.accountMasked, '••••1234');
    assert.ok(!JSON.stringify(detail.body).includes('accountLast4'));
    assert.equal(
      (
        await c.post(`/api/admin/vendors/${v._id}/warnings`, {
          message: 'Update your licence details',
        })
      ).status,
      201,
    );
  });
});

describe('listing creation and compliance', () => {
  it('creates a listing, normalises price in paise and shows it publicly', async () => {
    const v = await makeVendor();
    const c = await login(v);
    const res = await c.post('/api/vendor/listings', await productBody());
    assert.equal(res.status, 201);
    assert.equal(res.body.listing.pricePaise, 50000);
    const pub = await newClient(app).get(`/api/catalog/listings/${res.body.listing.id}`);
    assert.equal(pub.status, 200);
    assert.equal(pub.body.listing.discountPercent, 16);
    assert.equal(pub.body.vendor.name, 'Test Shop');
  });

  it('validates prices, SKU uniqueness and unknown fields (mass assignment)', async () => {
    const v = await makeVendor();
    const c = await login(v);
    assert.equal(
      (await c.post('/api/vendor/listings', { ...(await productBody()), mrpPaise: 100 })).status,
      422,
    );
    assert.equal(
      (await c.post('/api/vendor/listings', { ...(await productBody()), pricePaise: 12.5 })).status,
      422,
    );
    assert.equal(
      (
        await c.post('/api/vendor/listings', {
          ...(await productBody()),
          vendorId: String(v._id),
          soldCount: 999,
        })
      ).status,
      422,
    );
    assert.equal((await c.post('/api/vendor/listings', await productBody())).status, 201);
    const dup = await c.post(
      '/api/vendor/listings',
      await productBody({ product: { name: 'Different' } }),
    );
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'SKU_TAKEN');
  });

  it('device fields are only accepted for electronics-type categories', async () => {
    const v = await makeVendor();
    const c = await login(v);
    const shirt = await c.post(
      '/api/vendor/listings',
      await productBody({ product: { model: 'Z9' } }),
    );
    assert.equal(shirt.status, 422);
    assert.equal(shirt.body.error.code, 'DEVICE_FIELDS_NOT_ALLOWED');
    const mobiles = await catByName('Mobiles');
    const electronics = await catByName('Electronics');
    const phone = await c.post('/api/vendor/listings', {
      product: {
        name: 'Nova 5G',
        brand: { name: 'Nova' },
        categoryId: String(electronics._id),
        subcategoryId: String(mobiles._id),
        model: 'N5',
        version: 'Gen 2',
        deviceType: 'Smartphone',
      },
      sku: 'NOVA-5',
      pricePaise: 1999900,
      mrpPaise: 2299900,
      stock: 3,
    });
    assert.equal(phone.status, 201);
  });

  it('food needs an FSSAI licence and an expiry date', async () => {
    const noLicence = await makeVendor({ shop: 'No Licence' });
    await models.VendorProfile.updateOne(
      { userId: noLicence._id },
      { $unset: { fssaiLicense: '' } },
    );
    const ice = await catByName('Ice Cream');
    const body = {
      product: { name: 'Vanilla Tub', brand: { name: 'Frosty' }, categoryId: String(ice._id) },
      sku: 'IC-1',
      pricePaise: 10000,
      mrpPaise: 12000,
      stock: 20,
      expiryDate: new Date(Date.now() + 90 * 864e5).toISOString(),
    };
    const r1 = await (await login(noLicence)).post('/api/vendor/listings', body);
    assert.equal(r1.status, 422);
    assert.ok(r1.body.error.details.compliance);

    const licensed = await makeVendor({ shop: 'Licensed Foods' });
    const c = await login(licensed);
    const { expiryDate: _e, ...noExpiry } = body;
    assert.equal((await c.post('/api/vendor/listings', noExpiry)).status, 422);
    assert.equal(
      (await c.post('/api/vendor/listings', { ...body, expiryDate: '2020-01-01' })).status,
      422,
    );
    assert.equal((await c.post('/api/vendor/listings', body)).status, 201);
  });

  it('medicines need a drug licence and an explicit prescription flag; health devices are exempt', async () => {
    const noDl = await makeVendor({ shop: 'No DL' });
    await models.VendorProfile.updateOne({ userId: noDl._id }, { $unset: { drugLicense: '' } });
    const med = await catByName('Medicines & Healthcare');
    const otc = await models.Category.findOne({ slug: 'otc-medicines' });
    const body = {
      product: {
        name: 'Paracetamol 500',
        brand: { name: 'MediCo' },
        categoryId: String(med._id),
        subcategoryId: String(otc._id),
      },
      sku: 'PCM-1',
      pricePaise: 3000,
      mrpPaise: 3500,
      stock: 50,
      prescriptionRequired: false,
      expiryDate: new Date(Date.now() + 200 * 864e5).toISOString(),
    };
    assert.equal((await (await login(noDl)).post('/api/vendor/listings', body)).status, 422);

    const licensed = await makeVendor({ shop: 'Pharma One' });
    const c = await login(licensed);
    const { prescriptionRequired: _p, ...noFlag } = body;
    assert.equal((await c.post('/api/vendor/listings', noFlag)).status, 422);
    const ok = await c.post('/api/vendor/listings', body);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.listing.prescriptionRequired, false);

    const noDlDevices = await models.Category.findOne({ slug: 'health-devices' });
    const dev = await (
      await login(noDl)
    ).post('/api/vendor/listings', {
      product: {
        name: 'BP Monitor',
        brand: { name: 'MediCo' },
        categoryId: String(med._id),
        subcategoryId: String(noDlDevices._id),
      },
      sku: 'BP-1',
      pricePaise: 150000,
      mrpPaise: 180000,
      stock: 4,
    });
    assert.equal(dev.status, 201);
  });
});

describe('unique products versus vendor listings', () => {
  it('two vendors listing the same product share one Product and have separate listings', async () => {
    const v1 = await makeVendor({ shop: 'Shop One' });
    const v2 = await makeVendor({ shop: 'Shop Two' });
    const l1 = await makeListing(v1, {
      name: 'Vanilla Cone',
      brand: 'Frosty',
      sku: 'A1',
      pricePaise: 5000,
      mrpPaise: 5000,
    });
    const l2 = await makeListing(v2, {
      name: 'vanilla  cone',
      brand: 'FROSTY',
      sku: 'B7',
      pricePaise: 4500,
      mrpPaise: 5000,
    });
    assert.equal(String(l1.productId), String(l2.productId));
    assert.equal(await models.Product.countDocuments(), 1);
    assert.equal(await models.Listing.countDocuments(), 2);

    const a = await makeUser({ role: 'admin' });
    const c = await login(a);
    const r = await c.get('/api/admin/listings');
    assert.equal(r.body.metrics.listings, 2);
    assert.equal(r.body.metrics.uniqueProducts, 1);
    assert.equal(r.body.metrics.stockUnits, 20);
    assert.equal(r.body.metrics.unitsSold, 0);
  });

  it('a vendor can list the same product as another variant but not the same variant twice', async () => {
    const v = await makeVendor();
    const c = await login(v);
    const base = await productBody({ sku: 'V-S' });
    const first = await c.post('/api/vendor/listings', { ...base, variant: 'Small' });
    assert.equal(first.status, 201);
    const sameVariant = await c.post('/api/vendor/listings', {
      productId: first.body.listing.productId,
      sku: 'V-S2',
      variant: 'Small',
      pricePaise: 100,
      mrpPaise: 100,
      stock: 1,
    });
    assert.equal(sameVariant.status, 409);
    const other = await c.post('/api/vendor/listings', {
      productId: first.body.listing.productId,
      sku: 'V-L',
      variant: 'Large',
      pricePaise: 100,
      mrpPaise: 100,
      stock: 1,
    });
    assert.equal(other.status, 201);
  });
});

describe('vendor listing management and ownership', () => {
  it('updates price, stock and out-of-stock state; changes show publicly right away', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { stock: 5 });
    const c = await login(v);
    const anon = newClient(app);
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).body.listing.inStock, true);
    assert.equal(
      (await c.patch(`/api/vendor/listings/${l._id}`, { pricePaise: 45000, stock: 0 })).status,
      200,
    );
    const pub = (await anon.get(`/api/catalog/listings/${l._id}`)).body.listing;
    assert.equal(pub.pricePaise, 45000);
    assert.equal(pub.inStock, false);
    await c.patch(`/api/vendor/listings/${l._id}`, { stock: 8, manualOutOfStock: true });
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).body.listing.inStock, false);
    assert.equal((await c.get('/api/vendor/listings?stock=out')).body.total, 1);
    assert.equal((await c.patch(`/api/vendor/listings/${l._id}`, { stock: -1 })).status, 422);
    assert.equal((await c.patch(`/api/vendor/listings/${l._id}`, { mrpPaise: 100 })).status, 422);
  });

  it('a vendor cannot read or modify another vendor’s listing', async () => {
    const owner = await makeVendor({ shop: 'Owner' });
    const other = await makeVendor({ shop: 'Other' });
    const l = await makeListing(owner);
    const c = await login(other);
    assert.equal((await c.get(`/api/vendor/listings/${l._id}`)).status, 404);
    assert.equal((await c.patch(`/api/vendor/listings/${l._id}`, { pricePaise: 1 })).status, 404);
    assert.equal((await c.del(`/api/vendor/listings/${l._id}`)).status, 404);
    assert.equal((await c.get('/api/vendor/listings')).body.total, 0);
    assert.equal((await models.Listing.findById(l._id)).pricePaise, 50000);
  });

  it('stop selling hides the listing but keeps the record for history', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const c = await login(v);
    assert.equal((await c.del(`/api/vendor/listings/${l._id}`)).status, 200);
    assert.equal((await newClient(app).get(`/api/catalog/listings/${l._id}`)).status, 404);
    const kept = await models.Listing.findById(l._id);
    assert.equal(kept.status, 'inactive');
    assert.equal(
      (await c.patch(`/api/vendor/listings/${l._id}`, { status: 'active' })).status,
      200,
    );
    assert.equal((await newClient(app).get(`/api/catalog/listings/${l._id}`)).status, 200);
  });

  it('summary reports real counts', async () => {
    const v = await makeVendor();
    await makeListing(v, { stock: 0 });
    await makeListing(v, { stock: 7 });
    const s = (await (await login(v)).get('/api/vendor/summary')).body.summary;
    assert.equal(s.listings, 2);
    assert.equal(s.outOfStock, 1);
    assert.equal(s.stockUnits, 7);
  });

  it('suspending a vendor removes their listings from the public site; reinstating restores them', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const a = await makeUser({ role: 'admin' });
    const c = await login(a);
    const anon = newClient(app);
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).status, 200);
    await c.patch(`/api/admin/users/${v._id}/status`, { status: 'suspended', reason: 'test' });
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).status, 404);
    await c.patch(`/api/admin/users/${v._id}/status`, { status: 'active' });
    assert.equal((await anon.get(`/api/catalog/listings/${l._id}`)).status, 200);
  });

  it('admin can hide and restore a listing; the vendor cannot override a hide', async () => {
    const v = await makeVendor();
    const l = await makeListing(v);
    const a = await makeUser({ role: 'admin' });
    const ac = await login(a);
    assert.equal(
      (await ac.patch(`/api/admin/listings/${l._id}/moderation`, { action: 'hide' })).status,
      422,
    );
    assert.equal(
      (
        await ac.patch(`/api/admin/listings/${l._id}/moderation`, {
          action: 'hide',
          reason: 'Prohibited item',
        })
      ).status,
      200,
    );
    assert.equal((await newClient(app).get(`/api/catalog/listings/${l._id}`)).status, 404);
    const vc = await login(v);
    assert.equal(
      (await vc.patch(`/api/vendor/listings/${l._id}`, { status: 'active' })).status,
      403,
    );
    assert.equal(
      (await ac.patch(`/api/admin/listings/${l._id}/moderation`, { action: 'unhide' })).status,
      200,
    );
    assert.equal((await newClient(app).get(`/api/catalog/listings/${l._id}`)).status, 200);
    assert.ok(await models.AuditLog.findOne({ action: 'listing.hide' }));
  });
});

describe('listing images', () => {
  it('uploads an image, attaches it to a listing, and rejects someone else’s image', async () => {
    const v1 = await makeVendor({ shop: 'Img One' });
    const v2 = await makeVendor({ shop: 'Img Two' });
    const c1 = await login(v1);
    const up = await c1.upload('/api/uploads/image?purpose=listing', await makePng());
    assert.equal(up.status, 201);
    const body = await productBody();
    const ok = await c1.post('/api/vendor/listings', {
      ...body,
      images: [{ key: up.body.key, alt: 'Front view' }],
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.listing.images[0].alt, 'Front view');

    const c2 = await login(v2);
    const steal = await c2.post('/api/vendor/listings', {
      ...(await productBody({ sku: 'STEAL' })),
      images: [{ key: up.body.key }],
    });
    assert.equal(steal.status, 403);
    assert.equal(steal.body.error.code, 'IMAGE_NOT_OWNED');
  });
});
