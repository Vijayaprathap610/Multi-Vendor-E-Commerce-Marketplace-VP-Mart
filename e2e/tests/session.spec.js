import { test, expect, uiLogin, API } from '../support/fixtures.js';

test.describe('protected routes (scenario 2) and logout/authorization (scenario 22)', () => {
  test('signed-out visitors are sent to sign in, then returned to where they were going', async ({ page, buyer }) => {
    await page.goto('/cart');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(buyer.email);
    await page.getByLabel('Password', { exact: true }).fill(buyer.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByText('Your cart is empty')).toBeVisible();
    for (const path of ['/orders', '/account', '/vendor', '/admin']) {
      await page.context().clearCookies();
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test('a buyer cannot open vendor or admin areas, in the UI or the API', async ({ page, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    for (const path of ['/admin', '/admin/vendors', '/vendor', '/vendor/products']) {
      await page.goto(path);
      await expect(page.getByText('You don’t have access to this page')).toBeVisible();
    }
    const res = await page.request.get(`${API}/api/admin/users`);
    expect([401, 403]).toContain(res.status());
    const direct = await page.evaluate(async () => (await fetch('/api/admin/users')).status);
    expect(direct).toBe(403);
  });

  test('a vendor cannot use buyer-only pages', async ({ page, seed }) => {
    await uiLogin(page, seed.vendor.email, seed.vendor.password);
    await page.goto('/cart');
    await expect(page.getByText('You don’t have access to this page')).toBeVisible();
    await page.goto('/orders');
    await expect(page.getByText('You don’t have access to this page')).toBeVisible();
  });

  test('logging out ends the session everywhere, including a copied session cookie', async ({ page, browser, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    const cookies = await page.context().cookies();
    const access = cookies.find((c) => c.name === 'vp_access');
    expect(access.httpOnly).toBe(true);
    expect(cookies.find((c) => c.name === 'vp_refresh').httpOnly).toBe(true);

    await page.getByRole('button', { name: /hello, asha/i }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByText('Hello, sign in')).toBeVisible();
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);

    // The old access cookie, replayed by someone who copied it, no longer works.
    const other = await browser.newContext();
    await other.addCookies([{ name: 'vp_access', value: access.value, domain: 'localhost', path: '/' }]);
    const replay = await other.request.get(`${API}/api/auth/me`);
    expect(replay.status()).toBe(401);
    await other.close();
  });

  test('an expired access token is refreshed silently, and a dead session returns to sign in', async ({ page, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.context().clearCookies({ name: 'vp_access' });
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Hello, Asha' })).toBeVisible();
    await page.context().clearCookies({ name: 'vp_access' });
    await page.context().clearCookies({ name: 'vp_refresh' });
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('state-changing API calls without the CSRF token are refused', async ({ page, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    const status = await page.evaluate(async () => (await fetch('/api/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hacked' }) })).status);
    expect(status).toBe(403);
  });
});
