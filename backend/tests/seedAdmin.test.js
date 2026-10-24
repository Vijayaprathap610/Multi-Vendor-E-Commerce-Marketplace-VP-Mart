import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PASSWORD, User, createApp, newClient, resetDb, setupDb, teardownDb } from './helpers.js';

const run = promisify(execFile);
const seed = (env) =>
  run('node', ['src/scripts/seedAdmin.js'], { env: { ...process.env, ...env } }).catch((e) => e);

before(setupDb);
after(teardownDb);
beforeEach(resetDb);

describe('admin seed script', () => {
  it('creates an admin once, is idempotent, and the admin can log in', async () => {
    const env = { ADMIN_EMAIL: 'owner@vpmart.example', ADMIN_PASSWORD: PASSWORD };
    const first = await seed(env);
    assert.match(first.stdout, /Admin created/);
    const second = await seed(env);
    assert.match(second.stdout, /skipped/);
    assert.equal(await User.countDocuments({ role: 'admin' }), 1);
    const res = await newClient(createApp()).login('owner@vpmart.example');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.role, 'admin');
  });

  it('refuses to run without credentials or with a weak password', async () => {
    const none = await seed({ ADMIN_EMAIL: '', ADMIN_PASSWORD: '' });
    assert.ok(none.code !== 0 && none.code !== undefined);
    const weak = await seed({ ADMIN_EMAIL: 'owner@vpmart.example', ADMIN_PASSWORD: 'weak' });
    assert.ok(weak.code !== 0 && weak.code !== undefined);
    assert.equal(await User.countDocuments({ role: 'admin' }), 0);
  });
});
