import { test, expect } from '../support/fixtures.js';

const titles = (page) => page.locator('.vp-card-title').allTextContents();

test.describe('browsing, search and filters (scenario 3)', () => {
  test('home shows backend-driven sections and category tiles', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Shop by category' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New arrivals' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Today’s deals' })).toBeVisible();
    await expect(page.locator('.vp-rail').getByText('Linen Shirt').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Fashion/ }).first()).toBeVisible();
  });

  test('searching finds products and shows the result count; filters and chips work', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox', { name: 'Search VP Mart' }).first().fill('shirt');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=shirt/);
    await expect(page.getByText(/of 2 results|1–2 of 2/)).toBeVisible();
    expect((await titles(page)).sort()).toEqual(['Denim Shirt', 'Linen Shirt']);

    await page.getByLabel(/^Acme/).click();
    await expect(page.getByLabel(/^Acme/)).toBeChecked();
    await expect(page).toHaveURL(/brand=acme/);
    await expect.poll(() => titles(page)).toEqual(['Linen Shirt']);
    await page.getByRole('button', { name: 'Remove filter Acme' }).click();
    await expect.poll(async () => (await titles(page)).length).toBe(2);
  });

  test('category pages list their products, sub-categories, and breadcrumb', async ({ page }) => {
    await page.goto('/c/electronics');
    await expect(page.getByRole('heading', { name: 'Electronics', level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Sub-categories' }).getByRole('link', { name: 'Mobiles' })).toBeVisible();
    await expect(page.getByText('Nova 5G Phone')).toBeVisible();
    await page.getByRole('link', { name: 'Mobiles' }).first().click();
    await expect(page).toHaveURL(/\/c\/mobiles$/);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Electronics');
  });

  test('price filter, in-stock filter and sorting change the results', async ({ page }) => {
    await page.goto('/c/fashion');
    await page.getByLabel('Minimum price').first().fill('600');
    await page.getByLabel('Maximum price').first().fill('800');
    await page.getByRole('button', { name: 'Apply' }).first().click();
    await expect.poll(() => titles(page)).toEqual(['Cotton Trousers']);
    await page.getByRole('button', { name: /Remove filter/ }).first().click();

    await page.getByLabel('In stock only').click();
    await expect(page.getByLabel('In stock only')).toBeChecked();
    await expect.poll(async () => (await titles(page)).includes('Denim Shirt')).toBe(false);
    await page.getByLabel('In stock only').click();
    await expect(page.getByLabel('In stock only')).not.toBeChecked();

    await page.getByLabel('Sort by').selectOption('price_asc');
    await expect.poll(() => titles(page)).toEqual(['Linen Shirt', 'Cotton Trousers', 'Denim Shirt']);
    await page.getByLabel('Sort by').selectOption('price_desc');
    await expect.poll(() => titles(page)).toEqual(['Denim Shirt', 'Cotton Trousers', 'Linen Shirt']);
  });

  test('invalid price ranges are explained, and empty searches show a helpful state', async ({ page }) => {
    await page.goto('/search');
    await page.getByLabel('Minimum price').first().fill('900');
    await page.getByLabel('Maximum price').first().fill('100');
    await page.getByRole('button', { name: 'Apply' }).first().click();
    await expect(page.getByText('Minimum cannot exceed maximum')).toBeVisible();
    await page.goto('/search?q=zzzzzz');
    await expect(page.getByText('Nothing matches yet')).toBeVisible();
  });

  test('collection pages are backend-driven and distinct', async ({ page }) => {
    await page.goto('/deals');
    await expect(page.getByRole('heading', { name: 'Today’s deals', level: 1 })).toBeVisible();
    await expect(page.getByText('Linen Shirt')).toBeVisible();
    await expect(page.getByText('Cotton Trousers')).toHaveCount(0);
    await page.goto('/new-arrivals');
    await expect(page.getByRole('heading', { name: 'New arrivals', level: 1 })).toBeVisible();
  });

  test('product page shows price, discount, tax note, specs, seller and a delivery estimate for a PIN', async ({ page, seed }) => {
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    await expect(page.getByRole('heading', { name: 'Linen Shirt', level: 1 })).toBeVisible();
    await expect(page.getByText('₹499', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('37% off')).toBeVisible();
    await expect(page.getByText('Inclusive of 12% GST.')).toBeVisible();
    await expect(page.getByText('In stock')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Linen', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Seed Shop' })).toBeVisible();

    await page.getByRole('button', { name: /enter your pin code/i }).click();
    await page.getByLabel('PIN code').fill('0123');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a valid 6-digit PIN code')).toBeVisible();
    await page.getByLabel('PIN code').fill('600001');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Delivery to/)).toContainText('600001');
    await expect(page.getByText(/Shipping ₹49, free above ₹999/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Delivery to/)).toContainText('600001'); // remembered in this browser
  });

  test('delivery estimates reflect the product: ice cream will not travel far', async ({ page, seed }) => {
    await page.goto(`/product/${seed.ids.iceCream}/vanilla-ice-cream`);
    await page.getByRole('button', { name: /enter your pin code/i }).click();
    await page.getByLabel('PIN code').fill('110001');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/only be delivered to nearby locations/)).toBeVisible();
    await page.getByRole('button', { name: 'Change PIN' }).click();
    await page.getByLabel('PIN code').fill('641042');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(/Delivery to/)).toContainText('641042');
  });

  test('out-of-stock products cannot be bought', async ({ page, seed }) => {
    await page.goto(`/product/${seed.ids.denim}/denim-shirt`);
    await expect(page.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
    await expect(page.getByText('Currently unavailable')).toBeVisible();
  });

  test('regulated and device products show the right details', async ({ page, seed }) => {
    await page.goto(`/product/${seed.ids.rice}/sona-masoori-rice-5kg`);
    await expect(page.getByText('Best before / expiry')).toBeVisible();
    await page.goto(`/product/${seed.ids.phone}/nova-5g-phone`);
    await expect(page.getByRole('heading', { name: 'Nova 5G Phone', level: 1 })).toBeVisible();
  });
});
