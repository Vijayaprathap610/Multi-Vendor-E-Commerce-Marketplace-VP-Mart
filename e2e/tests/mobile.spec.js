import { test, expect, uiLogin } from '../support/fixtures.js';

test.describe('mobile experience', () => {
  test('the menu drawer gives access to account, shop links and every category', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('link', { name: 'Sign in' })).toBeVisible();
    for (const name of ['Trending', 'Best Sellers', 'Today’s Deals', 'Coupons & Offers', 'Kids & Toys', 'New Arrivals']) await expect(drawer.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Garden & Outdoor' })).toBeVisible();
    await drawer.getByRole('link', { name: 'Fashion', exact: true }).last().click();
    await expect(page).toHaveURL(/\/c\/fashion$/);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('search is available directly under the header', async ({ page }) => {
    await page.goto('/');
    const box = page.locator('.vp-h-search-m').getByRole('combobox', { name: 'Search VP Mart' });
    await expect(box).toBeVisible();
    await box.fill('shirt');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=shirt/);
  });

  test('filters open in a drawer and can be applied', async ({ page }) => {
    await page.goto('/c/fashion');
    await expect(page.locator('.vp-aside')).toBeHidden();
    await page.getByRole('button', { name: /Filters/ }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByLabel(/^Acme/).click();
    await expect(page).toHaveURL(/brand=acme/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.vp-card-title')).toHaveText(['Cotton Trousers', 'Linen Shirt'].sort());
  });

  test('buying works on a phone: add to cart, change quantity, read the totals', async ({ page, buyer, seed }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    await page.getByRole('button', { name: 'Add to cart' }).tap();
    await expect(page.getByText('Added 1 to your cart.')).toBeVisible();
    await page.getByRole('link', { name: /cart 1 item/i }).tap();
    await expect(page.getByRole('heading', { name: 'Shopping cart' })).toBeVisible();
    await page.getByLabel('Quantity for Linen Shirt').selectOption('3');
    await expect(page.locator('.vp-total')).toContainText('₹1,497.00');
  });

  test('tap targets are large enough and text stays readable', async ({ page, seed }) => {
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    const add = await page.getByRole('button', { name: 'Add to cart' }).boundingBox();
    expect(add.height).toBeGreaterThanOrEqual(44);
    const qty = await page.getByLabel('Quantity').boundingBox();
    expect(qty.height).toBeGreaterThanOrEqual(38);
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    expect(size).toBeGreaterThanOrEqual(15);
    expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('width=device-width');
  });

  test('banners and rails work with touch scrolling', async ({ page }) => {
    await page.goto('/');
    const track = page.locator('.vp-rail').filter({ has: page.getByRole('heading', { name: 'New arrivals' }) }).locator('.vp-rail-track');
    await expect(track).toBeVisible();
    const scrollable = await track.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);
    await expect(page.locator('.vp-rail-ctl').first()).toBeHidden(); // arrows hidden on touch screens
  });
});
