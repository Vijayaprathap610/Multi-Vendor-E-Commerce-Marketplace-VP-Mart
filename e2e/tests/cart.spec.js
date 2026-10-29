import { test, expect, uiLogin } from '../support/fixtures.js';

test.describe('cart (scenario 4)', () => {
  test('guests are asked to sign in, then can add to the cart and are returned to the product', async ({ page, seed, buyer }) => {
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email').fill(buyer.email);
    await page.getByLabel('Password', { exact: true }).fill(buyer.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(new RegExp(`/product/${seed.ids.linen}`));
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added 1 to your cart.')).toBeVisible();
  });

  test('add, change quantity, see server-calculated totals and shipping rules, and remove', async ({ page, seed, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    await page.getByLabel('Quantity').selectOption('2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added 2 to your cart.')).toBeVisible();
    await expect(page.getByRole('link', { name: /cart 2 items/i })).toBeVisible();

    await page.getByRole('link', { name: 'View cart' }).click();
    await expect(page.getByRole('heading', { name: 'Shopping cart' })).toBeVisible();
    // 2 x ₹499 = ₹998, below the seller's ₹999 free-shipping threshold, so ₹49 shipping applies.
    await expect(page.locator('.vp-summary')).toContainText('₹998.00');
    await expect(page.locator('.vp-summary')).toContainText('₹49.00');
    await expect(page.locator('.vp-total')).toContainText('₹1,047.00');
    await expect(page.locator('.vp-summary')).toContainText('of GST');

    await page.getByLabel('Quantity for Linen Shirt').selectOption('3');
    await expect(page.locator('.vp-summary')).toContainText('₹1,497.00');
    await expect(page.locator('.vp-summary')).toContainText('Free'); // now above the threshold
    await expect(page.locator('.vp-total')).toContainText('₹1,497.00');
    await expect(page.getByRole('button', { name: 'Proceed to checkout' })).toBeDisabled();

    await page.reload();
    await expect(page.getByLabel('Quantity for Linen Shirt')).toHaveValue('3'); // saved on the server
    await page.getByRole('button', { name: 'Remove Linen Shirt from cart' }).click();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
  });

  test('the cart follows the buyer across sessions and combines items correctly', async ({ page, seed, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    for (const [id, slug] of [[seed.ids.linen, 'linen-shirt'], [seed.ids.rice, 'sona-masoori-rice-5kg']]) {
      await page.goto(`/product/${id}/${slug}`);
      await page.getByRole('button', { name: 'Add to cart' }).click();
      await expect(page.getByText('Added 1 to your cart.')).toBeVisible();
    }
    await page.getByRole('button', { name: /hello, asha/i }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto('/cart');
    await expect(page.getByRole('link', { name: 'Linen Shirt' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sona Masoori Rice 5kg' })).toBeVisible();
    // ₹499 + ₹449 = ₹948; one seller, one shipment; below ₹999 so shipping is charged once.
    await expect(page.locator('.vp-summary')).toContainText('₹948.00');
    await expect(page.locator('.vp-summary')).toContainText('Shipping · Seed Shop');
  });

  test('quantity cannot exceed the stock', async ({ page, seed, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto(`/product/${seed.ids.trousers}/cotton-trousers`);
    await expect(page.getByLabel('Quantity').locator('option')).toHaveCount(4); // stock is 4
    await page.getByLabel('Quantity').selectOption('4');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added 4 to your cart.')).toBeVisible();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText(/Only 4 available/)).toBeVisible();
  });

  test('vendors see a clear message instead of a cart', async ({ page, seed }) => {
    await uiLogin(page, seed.vendor.email, seed.vendor.password);
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText(/Only buyer accounts can purchase/)).toBeVisible();
  });

  test('orders page shows an honest empty state for a new buyer', async ({ page, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.locator('.vp-header').getByRole('link', { name: /returns/i }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByText('You haven’t placed any orders yet')).toBeVisible();
  });
});
