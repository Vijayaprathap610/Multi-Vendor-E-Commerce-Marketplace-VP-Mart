import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import {
  AuditLog,
  User,
  createApp,
  makeUser,
  makeVendor,
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

const asRole = async (role, over = {}) => {
  const u = await makeUser({ role, ...over });
  const c = newClient(app);
  assert.equal((await c.login(u.email)).status, 200);
  return { u, c };
};

describe('role-based access control (enforced on the backend)', () => {
  it('rejects unauthenticated access to admin routes with 401', async () => {
    assert.equal((await newClient(app).get('/api/admin/users')).status, 401);
    assert.equal((await newClient(app).get('/api/admin/stats/users')).status, 401);
  });

  it('rejects buyers, vendors and delivery agents from admin routes with 403', async () => {
    for (const role of ['buyer', 'vendor', 'delivery_agent']) {
      const { c } = await asRole(role);
      assert.equal((await c.get('/api/admin/users')).status, 403, role);
      assert.equal((await c.get('/api/admin/stats/users')).status, 403, role);
    }
  });

  it('lets an admin list users and never leaks hashes or reset tokens', async () => {
    const { c } = await asRole('admin');
    await makeUser();
    const res = await c.get('/api/admin/users?limit=10');
    assert.equal(res.status, 200);
    assert.ok(res.body.total >= 2);
    assert.ok(!JSON.stringify(res.body).match(/passwordHash|resetTokenHash/));
  });

  it('filters and paginates, and validates query input', async () => {
    const { c } = await asRole('admin');
    await makeUser({ role: 'vendor', status: 'pending_approval', name: 'Zed Traders' });
    const res = await c.get('/api/admin/users?role=vendor&status=pending_approval&q=zed');
    assert.equal(res.body.items.length, 1);
    assert.equal((await c.get('/api/admin/users?limit=9999')).status, 422);
    assert.equal((await c.get('/api/admin/users?role[$ne]=buyer')).status, 422);
  });

  it('reports real counts from the database', async () => {
    const { c } = await asRole('admin');
    await makeUser({ role: 'vendor', status: 'pending_approval' });
    await makeUser({ role: 'vendor', status: 'pending_approval' });
    await makeUser({ role: 'buyer' });
    const { body } = await c.get('/api/admin/stats/users');
    assert.equal(body.byRole.vendor.pending_approval, 2);
    assert.equal(body.byRole.buyer.active, 1);
    assert.equal(body.byRole.admin.total, 1);
  });
});

describe('admin account approval and suspension', () => {
  it('approves a pending vendor and writes an audit entry', async () => {
    const { c, u: admin } = await asRole('admin');
    const vendor = await makeVendor({ approved: false });
    const res = await c.patch(`/api/admin/users/${vendor._id}/status`, { status: 'active' });
    assert.equal(res.status, 200);
    assert.equal((await User.findById(vendor._id)).status, 'active');
    const log = await AuditLog.findOne({
      action: 'admin.user_status_changed',
      targetId: String(vendor._id),
    });
    assert.equal(String(log.actorId), String(admin._id));
    assert.equal(log.metadata.to, 'active');
  });

  it('refuses to approve a vendor who has not submitted a shop profile', async () => {
    const { c } = await asRole('admin');
    const vendor = await makeVendor({ approved: false, profile: false });
    const res = await c.patch(`/api/admin/users/${vendor._id}/status`, { status: 'active' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROFILE_NOT_SUBMITTED');
    assert.equal((await User.findById(vendor._id)).status, 'pending_approval');
  });

  it('suspension kills the target’s live session immediately', async () => {
    const { c: adminClient } = await asRole('admin');
    const { u, c: buyerClient } = await asRole('buyer');
    assert.equal((await buyerClient.get('/api/auth/me')).status, 200);
    assert.equal(
      (
        await adminClient.patch(`/api/admin/users/${u._id}/status`, {
          status: 'suspended',
          reason: 'test',
        })
      ).status,
      200,
    );
    assert.equal((await buyerClient.get('/api/auth/me')).status, 401);
    assert.equal((await newClient(app).login(u.email)).status, 403);
  });

  it('enforces valid transitions and protects admins and self', async () => {
    const { c, u: admin } = await asRole('admin');
    const other = await makeUser({ role: 'admin' });
    const buyer = await makeUser();
    assert.equal(
      (await c.patch(`/api/admin/users/${admin._id}/status`, { status: 'suspended' })).status,
      400,
    );
    assert.equal(
      (await c.patch(`/api/admin/users/${other._id}/status`, { status: 'suspended' })).status,
      403,
    );
    assert.equal(
      (await c.patch(`/api/admin/users/${buyer._id}/status`, { status: 'rejected' })).status,
      409,
    );
    assert.equal(
      (await c.patch(`/api/admin/users/not-an-id/status`, { status: 'active' })).status,
      422,
    );
    assert.equal(
      (await c.patch(`/api/admin/users/${buyer._id}/status`, { status: 'deleted' })).status,
      422,
    );
  });

  it('a non-admin cannot change statuses even with a valid CSRF token', async () => {
    const { c } = await asRole('vendor', { status: 'active' });
    const victim = await makeUser();
    assert.equal(
      (await c.patch(`/api/admin/users/${victim._id}/status`, { status: 'suspended' })).status,
      403,
    );
    assert.equal((await User.findById(victim._id)).status, 'active');
  });
});

describe('token integrity', () => {
  it('rejects a JWT signed with the wrong secret even if it claims admin', async () => {
    const u = await makeUser();
    const forged = jwt.sign({ role: 'admin', sid: '000000000000000000000000' }, 'x'.repeat(40), {
      subject: String(u._id),
    });
    const res = await newClient(app)
      .agent.get('/api/admin/users')
      .set('Cookie', `vp_access=${forged}`);
    assert.equal(res.status, 401);
  });

  it('rejects an "alg: none" token', async () => {
    const u = await makeUser();
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: String(u._id), role: 'admin', sid: 'x' })}.`;
    const res = await newClient(app).agent.get('/api/auth/me').set('Cookie', `vp_access=${none}`);
    assert.equal(res.status, 401);
  });

  it('takes the role from the database, not from the token', async () => {
    const { u, c } = await asRole('buyer');
    // Token was issued while the user was a buyer; DB role is the source of truth.
    await User.updateOne({ _id: u._id }, { role: 'buyer' });
    assert.equal((await c.get('/api/admin/users')).status, 403);
  });
});

describe('API hygiene', () => {
  it('returns JSON 404 for unknown routes and 400 for malformed JSON', async () => {
    const c = newClient(app);
    assert.equal((await c.get('/api/nope')).status, 404);
    await c.get('/api/auth/csrf');
    const res = await c.agent
      .post('/api/auth/login')
      .set('x-csrf-token', c.csrf)
      .set('Content-Type', 'application/json')
      .send('{bad json');
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'BAD_JSON');
  });

  it('rejects oversized bodies', async () => {
    const c = newClient(app);
    const res = await c.post('/api/auth/login', {
      email: 'a@b.com',
      password: 'x'.repeat(200_000),
    });
    assert.equal(res.status, 413);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await newClient(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.ok(res.headers['x-content-type-options']);
    assert.ok(res.headers['strict-transport-security']);
  });

  it('only allows the configured CORS origin', async () => {
    const ok = await newClient(app).agent.get('/api/health').set('Origin', 'http://localhost:5173');
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
    const evil = await newClient(app)
      .agent.get('/api/health')
      .set('Origin', 'https://evil.example');
    assert.notEqual(evil.headers['access-control-allow-origin'], 'https://evil.example');
  });
});
