import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AuditLog,
  PASSWORD,
  Session,
  User,
  createApp,
  makeUser,
  newClient,
  resetDb,
  setupDb,
  teardownDb,
} from './helpers.js';
import { outbox } from '../src/services/mailer.js';

let app;
before(async () => {
  await setupDb();
  app = createApp();
});
after(teardownDb);
beforeEach(async () => {
  await resetDb();
  outbox.length = 0;
});

const reg = (over = {}) => ({
  name: 'Asha Rao',
  email: 'asha@example.com',
  password: PASSWORD,
  ...over,
});

describe('registration', () => {
  it('registers a buyer, sets HttpOnly cookies, never returns the hash', async () => {
    const c = newClient(app);
    const res = await c.post('/api/auth/register', reg());
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'buyer');
    assert.equal(res.body.user.status, 'active');
    assert.equal(res.body.user.passwordHash, undefined);
    const cookies = res.headers['set-cookie'].join('\n');
    assert.match(cookies, /vp_access=[^;]+;.*HttpOnly/i);
    assert.match(cookies, /vp_refresh=[^;]+;.*HttpOnly/i);
    const stored = await User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    assert.notEqual(stored.passwordHash, PASSWORD);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
  });

  it('puts vendors and delivery agents into pending_approval', async () => {
    for (const role of ['vendor', 'delivery_agent']) {
      const res = await newClient(app).post(
        '/api/auth/register',
        reg({ role, email: `${role}@example.com` }),
      );
      assert.equal(res.status, 201);
      assert.equal(res.body.user.status, 'pending_approval');
    }
  });

  it('blocks public admin registration and mass-assignment of status', async () => {
    const a = await newClient(app).post('/api/auth/register', reg({ role: 'admin' }));
    assert.equal(a.status, 422);
    const b = await newClient(app).post('/api/auth/register', {
      ...reg(),
      status: 'active',
      role: 'vendor',
    });
    assert.equal(b.status, 422);
    assert.equal(await User.countDocuments({ role: 'admin' }), 0);
  });

  it('rejects weak passwords and invalid emails with field errors', async () => {
    const res = await newClient(app).post(
      '/api/auth/register',
      reg({ password: 'short', email: 'nope' }),
    );
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.password);
    assert.ok(res.body.error.details.email);
  });

  it('rejects duplicate emails (case-insensitive)', async () => {
    await newClient(app).post('/api/auth/register', reg());
    const res = await newClient(app).post('/api/auth/register', reg({ email: 'ASHA@example.com' }));
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'EMAIL_TAKEN');
  });

  it('requires a valid CSRF token on state-changing requests', async () => {
    const res = await newClient(app).post('/api/auth/register', reg(), { csrf: false });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CSRF_INVALID');
  });
});

describe('csrf token delivery', () => {
  it('returns the CSRF token in the body so cross-domain SPAs can send it', async () => {
    const c = newClient(app);
    const res = await c.get('/api/auth/csrf');
    assert.match(res.body.csrfToken, /^[a-f0-9]{48}$/);
    assert.equal(c.csrf, res.body.csrfToken);
    const u = await makeUser();
    const login = await c.login(u.email);
    assert.equal(login.body.csrfToken, c.csrf);
  });
});

describe('login, lockout and logout', () => {
  it('logs in with correct credentials', async () => {
    const u = await makeUser();
    const c = newClient(app);
    const res = await c.login(u.email);
    assert.equal(res.status, 200);
    assert.equal((await c.get('/api/auth/me')).body.user.email, u.email);
  });

  it('gives the same error for wrong password and unknown email', async () => {
    const u = await makeUser();
    const a = await newClient(app).login(u.email, 'WrongPass123');
    const b = await newClient(app).login('ghost@example.com', 'WrongPass123');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(a.body.error.message, b.body.error.message);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const u = await makeUser();
    for (let i = 0; i < 3; i++) await newClient(app).login(u.email, 'WrongPass123');
    const res = await newClient(app).login(u.email);
    assert.equal(res.status, 429);
    assert.equal(res.body.error.code, 'ACCOUNT_LOCKED');
  });

  it('blocks suspended accounts only after verifying the password', async () => {
    const u = await makeUser({ status: 'suspended' });
    assert.equal((await newClient(app).login(u.email)).status, 403);
    assert.equal((await newClient(app).login(u.email, 'WrongPass123')).status, 401);
  });

  it('rejects protected routes without a session', async () => {
    assert.equal((await newClient(app).get('/api/auth/me')).status, 401);
  });

  it('logout revokes the session so a replayed access token stops working', async () => {
    const u = await makeUser();
    const c = newClient(app);
    await c.login(u.email);
    const stolen = c.cookie('vp_access');
    assert.ok(stolen);
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    const replay = await newClient(app)
      .agent.get('/api/auth/me')
      .set('Cookie', `vp_access=${stolen}`);
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error.code, 'SESSION_REVOKED');
  });
});

describe('refresh token rotation', () => {
  it('rotates the refresh token and detects reuse of an old one', async () => {
    const u = await makeUser();
    const c = newClient(app);
    await c.login(u.email);
    const oldRefresh = c.cookie('vp_refresh');
    assert.ok(oldRefresh, 'refresh cookie should exist');
    const r1 = await c.post('/api/auth/refresh');
    assert.equal(r1.status, 200);
    assert.notEqual(c.cookie('vp_refresh'), oldRefresh);

    // Attacker replays the old token: must fail AND kill the session.
    const attacker = newClient(app);
    const bad = await attacker.agent
      .post('/api/auth/refresh')
      .set('Cookie', `vp_refresh=${oldRefresh}; vp_csrf=x`)
      .set('x-csrf-token', 'x');
    assert.equal(bad.status, 401);
    assert.equal(await Session.countDocuments({ userId: u._id, revokedAt: { $exists: false } }), 0);
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });
});

describe('password management', () => {
  it('changes password, revokes other sessions, keeps the current one', async () => {
    const u = await makeUser();
    const a = newClient(app);
    const b = newClient(app);
    await a.login(u.email);
    await b.login(u.email);
    const bad = await a.post('/api/auth/change-password', {
      currentPassword: 'Nope12345678',
      newPassword: 'Another1Pass9',
    });
    assert.equal(bad.status, 400);
    const ok = await a.post('/api/auth/change-password', {
      currentPassword: PASSWORD,
      newPassword: 'Another1Pass9',
    });
    assert.equal(ok.status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 200);
    assert.equal((await b.get('/api/auth/me')).status, 401);
    assert.equal((await newClient(app).login(u.email, 'Another1Pass9')).status, 200);
  });

  it('forgot-password never reveals whether an email exists', async () => {
    const u = await makeUser();
    const known = await newClient(app).post('/api/auth/forgot-password', { email: u.email });
    const unknown = await newClient(app).post('/api/auth/forgot-password', {
      email: 'ghost@example.com',
    });
    assert.equal(known.status, 200);
    assert.deepEqual(known.body, unknown.body);
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, u.email);
  });

  it('resets the password with a single-use token and revokes all sessions', async () => {
    const u = await makeUser();
    const logged = newClient(app);
    await logged.login(u.email);
    await newClient(app).post('/api/auth/forgot-password', { email: u.email });
    const token = outbox[0].text.match(/token=([a-f0-9]{64})/)[1];

    const ok = await newClient(app).post('/api/auth/reset-password', {
      token,
      newPassword: 'Brand9NewPass',
    });
    assert.equal(ok.status, 200);
    assert.equal((await logged.get('/api/auth/me')).status, 401);
    assert.equal((await newClient(app).login(u.email, 'Brand9NewPass')).status, 200);

    const again = await newClient(app).post('/api/auth/reset-password', {
      token,
      newPassword: 'Third9NewPass',
    });
    assert.equal(again.status, 400);
    assert.equal(again.body.error.code, 'RESET_TOKEN_INVALID');
  });

  it('rejects an expired reset token', async () => {
    const u = await makeUser();
    await newClient(app).post('/api/auth/forgot-password', { email: u.email });
    const token = outbox[0].text.match(/token=([a-f0-9]{64})/)[1];
    await User.updateOne({ _id: u._id }, { resetTokenExpires: new Date(Date.now() - 1000) });
    const res = await newClient(app).post('/api/auth/reset-password', {
      token,
      newPassword: 'Brand9NewPass',
    });
    assert.equal(res.status, 400);
  });
});

describe('profile, deactivation and deletion', () => {
  it('updates name and phone but ignores nothing silently: unknown fields are rejected', async () => {
    const u = await makeUser();
    const c = newClient(app);
    await c.login(u.email);
    const ok = await c.patch('/api/users/me', { name: 'New Name', phone: '9876543210' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.name, 'New Name');
    const bad = await c.patch('/api/users/me', { role: 'admin' });
    assert.equal(bad.status, 422);
    assert.equal((await User.findById(u._id)).role, 'buyer');
  });

  it('deactivation requires the password and ends the session', async () => {
    const u = await makeUser();
    const c = newClient(app);
    await c.login(u.email);
    assert.equal(
      (await c.post('/api/users/me/deactivate', { password: 'WrongPass123' })).status,
      400,
    );
    assert.equal((await c.post('/api/users/me/deactivate', { password: PASSWORD })).status, 200);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    assert.equal((await newClient(app).login(u.email)).status, 403);
  });

  it('buyer deletion anonymises personal data and keeps the record', async () => {
    const u = await makeUser({ phone: '9876543210' });
    const c = newClient(app);
    await c.login(u.email);
    assert.equal((await c.post('/api/users/me/delete', { password: PASSWORD })).status, 200);
    const after = await User.findById(u._id);
    assert.equal(after.status, 'deleted');
    assert.equal(after.name, 'Deleted User');
    assert.equal(after.phone, undefined);
    assert.match(after.email, /@deleted\.invalid$/);
    assert.equal((await newClient(app).login(u.email)).status, 401);
  });

  it('vendors cannot self-delete', async () => {
    const u = await makeUser({ role: 'vendor' });
    const c = newClient(app);
    await c.login(u.email);
    const res = await c.post('/api/users/me/delete', { password: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal((await User.findById(u._id)).status, 'active');
  });
});

describe('rate limiting and audit', () => {
  it('rate-limits repeated login attempts per IP', async () => {
    const limited = createApp({ authLimit: 3 });
    const c = newClient(limited);
    const codes = [];
    for (let i = 0; i < 5; i++)
      codes.push((await c.post('/api/auth/login', { email: 'a@b.com', password: 'x' })).status);
    assert.deepEqual(codes.slice(0, 3), [401, 401, 401]);
    assert.deepEqual(codes.slice(3), [429, 429]);
  });

  it('records security events in the audit log without secrets', async () => {
    const u = await makeUser();
    await newClient(app).login(u.email);
    const log = await AuditLog.findOne({ action: 'auth.login', targetId: String(u._id) }).lean();
    assert.ok(log);
    assert.ok(!JSON.stringify(log).includes(PASSWORD));
  });
});

describe('rate limits count failures, not normal use', () => {
  it('successful logins and refreshes never exhaust the limit', async () => {
    const limited = createApp({ authLimit: 3 });
    const u = await makeUser();
    const c = newClient(limited);
    for (let i = 0; i < 8; i++) assert.equal((await c.login(u.email)).status, 200, `login ${i}`);
    for (let i = 0; i < 8; i++)
      assert.equal((await c.post('/api/auth/refresh')).status, 200, `refresh ${i}`);
  });

  it('failed logins are still throttled', async () => {
    const limited = createApp({ authLimit: 3 });
    const codes = [];
    for (let i = 0; i < 5; i++)
      codes.push(
        (await newClient(limited).post('/api/auth/login', { email: 'x@y.com', password: 'bad' }))
          .status,
      );
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  });
});
