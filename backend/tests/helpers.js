// Import this file FIRST in every test file: it sets the environment before config loads.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI ??= `mongodb://127.0.0.1:27017/vpmart_test_${process.pid}?replicaSet=rs0`;
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.BCRYPT_ROUNDS = '4';
process.env.MAX_FAILED_LOGINS = '3';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.MAIL_TRANSPORT = 'outbox';

const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { createApp } = await import('../src/app.js');
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { default: Session } = await import('../src/models/Session.js');
const { default: AuditLog } = await import('../src/models/AuditLog.js');
const { hashPassword } = await import('../src/services/userService.js');

export { mongoose, User, Session, AuditLog, createApp };
export const PASSWORD = 'Sup3rSecret99';

export async function setupDb() {
  await connectDb();
  await Promise.all([User, Session, AuditLog].map((m) => m.init()));
}

export async function teardownDb() {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
}

export async function resetDb() {
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), AuditLog.deleteMany({})]);
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
  async login(email, password = PASSWORD) {
    return this.post('/api/auth/login', { email, password });
  }
}

export const newClient = (app) => new Client(app);
