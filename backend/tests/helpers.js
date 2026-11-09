// Import this file FIRST in every test file: it sets the environment before config loads.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= `mongodb://127.0.0.1:27018/vpmart_test_${process.pid}?replicaSet=rs0`;
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.BCRYPT_ROUNDS = '4';
process.env.MAX_FAILED_LOGINS = '3';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.MAIL_TRANSPORT = 'outbox';
process.env.REDIS_URL = 'redis://127.0.0.1:6379/15';
process.env.STORAGE_DRIVER = 'local';
process.env.UPLOAD_DIR = `/tmp/vpmart_uploads_${process.pid}`;
process.env.PUBLIC_API_URL = 'http://localhost:5000';
process.env.DELIVERY_HOLIDAYS = '2026-11-12';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { createApp } = await import('../src/app.js');
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const models = await import('../src/models/index.js');
const { User, Session, AuditLog, allModels } = models;
const { flushForTests, closeRedis, setRedisForTests, MemoryRedis } = await import('../src/services/cache.js');
setRedisForTests(new MemoryRedis());
const { seedCategories } = await import('../src/services/seedCatalog.js');
const fsp = await import('node:fs/promises');
const sharp = (await import('sharp')).default;
const { createListing } = await import('../src/services/listingService.js');
const provider = await import('../src/services/paymentProvider.js');
const { cancelUnpaid } = await import('../src/services/orderService.js');
const { hashPassword } = await import('../src/services/userService.js');

export { mongoose, User, Session, AuditLog, createApp, models, seedCategories };
export const PASSWORD = 'Sup3rSecret99';
export const KEY_SECRET = 'test_key_secret_123';
export const WEBHOOK_SECRET = 'whsec_test_123';

// A stand-in for the Razorpay API CLIENT only (creating orders and refunds needs real keys).
// Signature checking is NOT faked: the app's real HMAC code runs against these test secrets.
export function installFakeProvider(over = {}) {
  const calls = { orders: [], refunds: [] };
  const fake = {
    name: 'razorpay',
    keyId: 'rzp_test_fake',
    keySecret: KEY_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    createOrder: async (o) => {
      calls.orders.push(o);
      return { id: `order_${Math.random().toString(36).slice(2, 12)}`, amount: o.amountPaise };
    },
    refund: async (r) => {
      calls.refunds.push(r);
      return { id: `rfnd_${Math.random().toString(36).slice(2, 12)}` };
    },
    ...over,
  };
  provider.setProviderForTests(fake);
  return { fake, calls };
}
export const removeFakeProvider = () => provider.setProviderForTests(null);
export const sign = (orderId, paymentId) =>
  provider.signForTests(KEY_SECRET, `${orderId}|${paymentId}`);
export const signBody = (raw) => provider.signForTests(WEBHOOK_SECRET, raw);
export { cancelUnpaid };

export async function makeAddress(user, over = {}) {
  return models.Address.create({
    userId: user._id,
    name: 'Asha Rao',
    phone: '9876543210',
    line1: '12 Lake View Road',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    isDefault: true,
    ...over,
  });
}
export const makePng = (w = 64, h = 64, color = '#d62839') =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .png()
    .toBuffer();

export async function catByName(name) {
  return models.Category.findOne({ name });
}

// Creates a listing through the real service (same validation, compliance and visibility rules).
export async function makeListing(vendor, over = {}) {
  const cat = over.category ?? (await catByName('Fashion'));
  const n = Math.random().toString(36).slice(2, 7);
  const { category: _c, ...rest } = over;
  return createListing(vendor, {
    product: {
      name: rest.name ?? `Cotton Shirt ${n}`,
      brand: { name: rest.brand ?? 'Acme' },
      categoryId: String(cat._id),
      ...(rest.product ?? {}),
    },
    sku: rest.sku ?? `SKU-${n}`,
    pricePaise: rest.pricePaise ?? 50000,
    mrpPaise: rest.mrpPaise ?? 60000,
    stock: rest.stock ?? 10,
    images: [],
    ...(rest.extra ?? {}),
  });
}

export async function setupDb() {
  await connectDb();
  await Promise.all(allModels.map((m) => m.init()));
  await flushForTests();
}

export async function teardownDb() {
  await mongoose.connection.dropDatabase();
  await flushForTests();
  await closeRedis();
  await disconnectDb();
  await fsp.rm(process.env.UPLOAD_DIR, { recursive: true, force: true });
}

export async function resetDb() {
  await Promise.all(allModels.map((m) => m.deleteMany({})));
  await flushForTests();
}

export async function makeUser(overrides = {}) {
  const n = Math.random().toString(36).slice(2, 8);
  return User.create({
    name: 'Test User',
    email: `user_${n}@example.com`,
    role: 'buyer',
    status: 'active',
    passwordHash: await hashPassword(PASSWORD),
    ...overrides,
  });
}

// Cookie-aware API client that automatically does the CSRF double-submit like the SPA will.
// Raw JSON POST with explicit headers (used for webhooks, which carry no cookies or CSRF token).
export async function rawPost(app, url, bodyText, headers = {}) {
  return request(app).post(url).set('Content-Type', 'application/json').set(headers).send(bodyText);
}

export class Client {
  constructor(app) {
    this.agent = request.agent(app);
    this.csrf = null;
  }
  track(res) {
    for (const c of res.headers['set-cookie'] ?? []) {
      if (!c.startsWith('vp_csrf=')) continue;
      const value = c.split(';')[0].slice('vp_csrf='.length);
      this.csrf = /Expires=Thu, 01 Jan 1970/i.test(c) || !value ? null : value;
    }
    return res;
  }
  async call(method, url, body, { csrf = true } = {}) {
    if (method !== 'get' && csrf && !this.csrf) this.track(await this.agent.get('/api/auth/csrf'));
    let r = this.agent[method](url);
    if (method !== 'get' && csrf && this.csrf) r = r.set('x-csrf-token', this.csrf);
    if (body !== undefined) r = r.send(body);
    return this.track(await r);
  }
  get = (u) => this.call('get', u);
  post = (u, b, o) => this.call('post', u, b ?? {}, o);
  patch = (u, b, o) => this.call('patch', u, b ?? {}, o);
  cookie(name) {
    // Refresh cookie is scoped to /api/auth, so look the cookie up at that path too.
    for (const path of ['/', '/api/auth/refresh']) {
      const jar = this.agent.jar.getCookies({
        domain: '127.0.0.1',
        path,
        secure: false,
        script: false,
      });
      const found = jar.find((c) => c.name === name);
      if (found) return found.value;
    }
    return undefined;
  }
  async upload(url, buffer, filename = 'x.png') {
    if (!this.csrf) this.track(await this.agent.get('/api/auth/csrf'));
    return this.track(
      await this.agent.post(url).set('x-csrf-token', this.csrf).attach('image', buffer, filename),
    );
  }
  put = (u, b, o) => this.call('put', u, b ?? {}, o);
  del = (u) => this.call('delete', u, undefined);
  async login(email, password = PASSWORD) {
    return this.post('/api/auth/login', { email, password });
  }
}

export async function makeVendor({
  approved = true,
  profile = true,
  shop = 'Test Shop',
  ...over
} = {}) {
  const u = await makeUser({
    role: 'vendor',
    status: approved ? 'active' : 'pending_approval',
    ...over,
  });
  if (profile) {
    await models.VendorProfile.create({
      userId: u._id,
      shopName: shop,
      slug:
        shop.toLowerCase().replace(/[^a-z0-9]+/g, '-') +
        '-' +
        Math.random().toString(36).slice(2, 5),
      businessName: `${shop} Traders`,
      fssaiLicense: '12345678901234',
      drugLicense: 'DL-TN-12345',
      pickupAddress: {
        line1: '1 Market Rd',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641001',
      },
      payout: { accountHolder: 'Test Owner', accountLast4: '1234', ifsc: 'HDFC0001234' },
      submittedAt: new Date(),
    });
  }
  return u;
}

export const newClient = (app) => new Client(app);
