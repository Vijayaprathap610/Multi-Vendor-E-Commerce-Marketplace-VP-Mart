import { request } from '@playwright/test';

// Small cookie-aware client for test setup (creating users, listings, approvals) through the
// real HTTP API, including the CSRF handshake.
export class Api {
  static async create(baseURL) {
    const a = new Api();
    a.ctx = await request.newContext({ baseURL });
    return a;
  }
  async csrf() {
    const r = await this.ctx.get('/api/auth/csrf');
    this.token = (await r.json()).csrfToken;
  }
  async call(method, url, data) {
    if (method !== 'get' && !this.token) await this.csrf();
    const res = await this.ctx[method](url, { data, headers: method === 'get' ? {} : { 'x-csrf-token': this.token } });
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
    if (body?.csrfToken) this.token = body.csrfToken;
    return { status: res.status(), body };
  }
  get = (u) => this.call('get', u);
  post = (u, d) => this.call('post', u, d ?? {});
  put = (u, d) => this.call('put', u, d ?? {});
  patch = (u, d) => this.call('patch', u, d ?? {});
  del = (u) => this.call('delete', u);
  async ok(promise, what) {
    const r = await promise;
    if (r.status >= 400) throw new Error(`${what} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }
  login = (email, password) => this.ok(this.post('/api/auth/login', { email, password }), `login ${email}`);
  dispose = () => this.ctx.dispose();
}

export const unique = (p = 'u') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const PASSWORD = 'E2ePassw0rd!x';

// 1x1 red PNG used for upload tests.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export const png = (name = 'photo.png') => ({ name, mimeType: 'image/png', buffer: PNG });

export async function registerUser(api, { role = 'buyer', name = 'E2E User', email = `${unique(role)}@example.com`, password = PASSWORD } = {}) {
  await api.ok(api.post('/api/auth/register', { name, email, password, role }), `register ${role}`);
  return { email, password, name };
}

export const PROFILE = {
  businessName: 'E2E Traders LLP',
  pickupAddress: { line1: '1 Market Road', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001' },
  payout: { accountHolder: 'E2E Owner', ifsc: 'HDFC0001234' },
  accountNumber: '123456789012',
  fssaiLicense: '12345678901234',
  drugLicense: 'DL-E2E-001',
  delivery: { processingDays: 1, dispatchCutoffHour: 16, shippingChargePaise: 4900, freeShippingAbovePaise: 99900 },
};

// Registers a vendor, completes and submits the profile, and has the admin approve it.
export async function approvedVendor(adminApi, base, { shop = `Shop ${unique('s')}`, profile = {} } = {}) {
  const api = await Api.create(base);
  const u = await registerUser(api, { role: 'vendor', name: `${shop} Owner` });
  await api.ok(api.put('/api/vendor/profile', { shopName: shop, ...PROFILE, ...profile }), 'vendor profile');
  await api.ok(api.post('/api/vendor/profile/submit'), 'submit profile');
  const me = await api.ok(api.get('/api/auth/me'), 'me');
  await adminApi.ok(adminApi.patch(`/api/admin/users/${me.user.id}/status`, { status: 'active' }), 'approve vendor');
  return { api, id: me.user.id, shop, ...u };
}
