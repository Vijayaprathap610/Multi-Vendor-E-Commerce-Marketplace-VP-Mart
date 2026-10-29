import { test, expect, uiLogin } from '../support/fixtures.js';

const H1 = (page, name) => page.getByRole('heading', { level: 1, name, exact: true });

test.describe('header, navbar and footer (scenario 19)', () => {
  test('the logo returns home with client-side navigation (no page reload)', async ({ page }) => {
    await page.goto('/faq');
    await page.evaluate(() => (window.__noReload = 'still-here'));
    await page.getByRole('link', { name: 'VP Mart home' }).first().click();
    await expect(page).toHaveURL('/');
    expect(await page.evaluate(() => window.__noReload)).toBe('still-here');
  });

  test('every secondary-navigation item leads to a working page', async ({ page }) => {
    const items = [
      ['Trending', '/trending', 'Trending now'], ['Best Sellers', '/best-sellers', 'Best sellers'], ['Today’s Deals', '/deals', 'Today’s deals'],
      ['Coupons & Offers', '/offers', 'Coupons & offers'], ['Electronics', '/c/electronics', 'Electronics'], ['Mobiles', '/c/mobiles', 'Mobiles'],
      ['Fashion', '/c/fashion', 'Fashion'], ['Groceries', '/c/groceries', 'Groceries'], ['Home & Kitchen', '/c/home-kitchen', 'Home & Kitchen'],
      ['Kids & Toys', '/search?category=kids-baby,toys-games', 'All products'], ['New Arrivals', '/new-arrivals', 'New arrivals'],
    ];
    for (const [label, url, heading] of items) {
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Shop by' }).getByRole('link', { name: label, exact: true }).click();
      await expect(page, label).toHaveURL(new RegExp(url.replace(/[?]/g, '\\?')));
      await expect(H1(page, heading), label).toBeVisible();
      await expect(page.getByText('Page not found'), label).toHaveCount(0);
    }
  });

  test('All Categories lists every category and opens sub-categories', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /All Categories/ }).click();
    const panel = page.getByRole('region', { name: 'All categories' });
    await expect(panel.locator('.vp-allcats-top')).toHaveCount(18);
    for (const name of ['Groceries', 'Food & Beverages', 'Ice Cream', 'Medicines & Healthcare', 'Furniture', 'Electronics', 'Fashion', 'Home & Kitchen', 'Vessels and Kitchenware', 'Kids & Baby', 'Toys & Games', 'Books & Stationery', 'Beauty & Personal Care', 'Sports & Fitness', 'Home Appliances', 'Pet Supplies', 'Automotive Accessories', 'Garden & Outdoor']) {
      await expect(panel.getByRole('link', { name, exact: true }), name).toBeVisible();
    }
    await panel.getByRole('link', { name: 'Mobiles' }).click();
    await expect(page).toHaveURL(/\/c\/mobiles$/);
    await expect(panel).toBeHidden();
    await page.getByRole('button', { name: /All Categories/ }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'All categories' })).toBeHidden();
  });

  test('every footer link leads to a real page', async ({ page, buyer }) => {
    const links = [
      ['About Us', 'About VP Mart'], ['Contact Us', 'Contact us'], ['Marketplace information', 'About VP Mart'],
      ['Help Center', 'Help Center'], ['FAQs', 'Frequently asked questions'], ['Shipping and Delivery', 'Shipping and delivery'],
      ['Returns and Refunds', 'Returns and refunds'], ['Privacy Policy', 'Privacy policy'], ['Terms and Conditions', 'Terms and conditions'],
      ['Shipping Policy', 'Shipping policy'], ['Cancellation and Refund Policy', 'Cancellation and refund policy'], ['Cookie Policy', 'Cookie policy'],
      ['Contact Support', 'Contact us'],
    ];
    for (const [name, heading] of links) {
      await page.goto('/');
      await page.getByRole('contentinfo').getByRole('link', { name, exact: true }).click();
      await expect(H1(page, heading), name).toBeVisible();
      await expect(page.getByText('Page not found'), name).toHaveCount(0);
    }
    const cats = await page.goto('/').then(() => page.getByRole('navigation', { name: 'Shopping categories' }).getByRole('link').allTextContents());
    expect(cats).toHaveLength(18);
    for (const name of ['Groceries', 'Food & Beverages', 'Electronics', 'Fashion', 'Home & Kitchen', 'Kids & Baby', 'Toys & Games']) {
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Shopping categories' }).getByRole('link', { name, exact: true }).click();
      await expect(H1(page, name), name).toBeVisible();
    }
    // Account links lead to sign-in for visitors and to real pages once signed in.
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'My Account' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await uiLogin(page, buyer.email, buyer.password);
    for (const [name, heading] of [['My Orders', 'Your orders'], ['Order Tracking', 'Track your order'], ['My Account', /Hello, Asha/]]) {
      await page.goto('/');
      await page.getByRole('contentinfo').getByRole('link', { name, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading }), name).toBeVisible();
    }
  });

  test('footer shows the current year and no invented social or payment claims', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toContainText(`© ${new Date().getFullYear()} VP Mart`);
    await expect(page.getByLabel('Social media')).toHaveCount(0);
    await expect(page.getByText(/Payment options/)).toHaveCount(0);
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'VP Mart home' })).toBeVisible();
  });

  test('the footer sits below short pages and follows long ones without overlapping', async ({ page, buyer }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto('/orders');
    const vh = page.viewportSize().height;
    const footer = await page.getByRole('contentinfo').boundingBox();
    const main = await page.locator('main').boundingBox();
    expect(footer.y + footer.height).toBeGreaterThanOrEqual(vh - 1); // pinned to the bottom of a short page
    expect(main.y + main.height).toBeLessThanOrEqual(footer.y + 1);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'New arrivals' })).toBeVisible();
    const f2 = await page.getByRole('contentinfo').boundingBox();
    const m2 = await page.locator('main').boundingBox();
    expect(m2.y + m2.height).toBeLessThanOrEqual(f2.y + 1);
    expect(f2.y).toBeGreaterThan(vh);
  });

  test('the location selector validates PIN codes and the choice survives reloads', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /select pin code/i }).click();
    await page.getByLabel('PIN code').fill('12345');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a valid 6-digit PIN code')).toBeVisible();
    await page.getByLabel('PIN code').fill('600001');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: /deliver to 600001/i })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /deliver to 600001/i })).toBeVisible();
    await page.getByRole('button', { name: /deliver to 600001/i }).click();
    await page.getByRole('button', { name: 'Clear location' }).click();
    await expect(page.getByRole('button', { name: /select pin code/i })).toBeVisible();
  });

  test('search offers suggestions that can be chosen with the keyboard', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search VP Mart' }).first();
    await box.fill('lin');
    const list = page.getByRole('listbox', { name: 'Suggestions' });
    await expect(list.getByRole('option', { name: /Linen Shirt/ })).toBeVisible();
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/search\?q=Linen(\+|%20)Shirt/);
    await expect(page.locator('.vp-card-title', { hasText: 'Linen Shirt' }).first()).toBeVisible();
  });

  test('keyboard users get a skip link and can reach the cart', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
    await page.goto('/');
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => /Cart/.test(document.activeElement?.textContent || '') && document.activeElement?.getAttribute('href') === '/cart');
    }
    expect(reached).toBe(true);
  });

  test('unknown pages show a helpful not-found page inside the normal layout', async ({ page }) => {
    await page.goto('/this/does/not/exist');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL('/');
  });
});
