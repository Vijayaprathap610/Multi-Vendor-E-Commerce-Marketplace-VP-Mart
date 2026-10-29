import { test, expect, uiLogin } from '../support/fixtures.js';

test.describe('error handling (scenario 21)', () => {
  test('a failing search API shows an error with a working retry', async ({ page }) => {
    let fail = true;
    await page.route('**/api/catalog/search*', (route) => (fail ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }) }) : route.continue()));
    await page.goto('/search?q=shirt');
    await expect(page.getByRole('alert')).toContainText('Something went wrong');
    await expect(page.locator('.vp-card')).toHaveCount(0);
    fail = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('.vp-card-title').first()).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('an unreachable server is reported honestly on the homepage and recovers', async ({ page }) => {
    let down = true;
    await page.route('**/api/catalog/home', (route) => (down ? route.abort('connectionrefused') : route.continue()));
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText(/Cannot reach the server/);
    down = false;
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'New arrivals' })).toBeVisible();
  });

  test('unknown products, categories and shops show friendly messages', async ({ page }) => {
    await page.goto('/product/64b000000000000000000000/nope');
    await expect(page.getByText('This product isn’t available')).toBeVisible();
    await page.goto('/product/not-an-id/nope');
    await expect(page.getByRole('alert').or(page.getByText('This product isn’t available'))).toBeVisible();
    await page.goto('/c/no-such-category');
    await expect(page.getByText('Category not found')).toBeVisible();
    await page.goto('/shop/no-such-shop');
    await expect(page.getByText('Shop not found')).toBeVisible();
  });

  test('a rate-limited or failing form reports the real reason and never claims success', async ({ page }) => {
    await page.route('**/api/contact', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' } }) }));
    await page.goto('/contact');
    await page.getByLabel('Your name').fill('Asha');
    await page.getByLabel('Email').fill('a@example.com');
    await page.getByLabel('Message').fill('Hello, this is a test message.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many attempts');
    await expect(page.getByText(/has been sent/)).toHaveCount(0);
  });

  test('server-side validation errors appear next to the right fields', async ({ page }) => {
    await page.route('**/api/auth/register', (route) => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields', details: { email: 'Server says this email is not allowed' } } }) }));
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Email').fill('asha@example.com');
    await page.getByLabel('Password', { exact: true }).fill('Sup3rSecret99');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Server says this email is not allowed')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Please correct the highlighted fields');
    await expect(page).toHaveURL(/\/register$/);
  });

  test('stock that runs out after adding to the cart is flagged and excluded from the total', async ({ page, buyer, seed, admin }) => {
    const { Api } = await import('../support/api.js');
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto(`/product/${seed.ids.rice}/sona-masoori-rice-5kg`);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added 1 to your cart.')).toBeVisible();
    // The seller sets stock to zero while it sits in the cart.
    const vendor = await Api.create('http://localhost:5100');
    await vendor.login(seed.vendor.email, seed.vendor.password);
    await vendor.ok(vendor.patch(`/api/vendor/listings/${seed.ids.rice}`, { stock: 0 }), 'zero stock');
    await page.goto('/cart');
    await expect(page.getByText('This item is out of stock')).toBeVisible();
    await expect(page.getByText('Resolve the highlighted items before checkout.')).toBeVisible();
    await expect(page.locator('.vp-total')).toContainText('₹0.00');
    await vendor.ok(vendor.patch(`/api/vendor/listings/${seed.ids.rice}`, { stock: 50 }), 'restore stock');
    await vendor.dispose();
    expect(admin).toBeTruthy();
  });
});
