import AxeBuilder from '@axe-core/playwright';
import { test, expect, uiLogin, API } from '../support/fixtures.js';
import { approvedVendor } from '../support/api.js';

// Automated WCAG 2.0/2.1 A and AA checks. These catch a subset of real problems; they do not
// replace manual keyboard and screen-reader testing.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
async function audit(page, label) {
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = r.violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target.join(' ')}`);
  expect(summary, `${label} accessibility violations`).toEqual([]);
}

test.describe('accessibility (axe, WCAG A/AA)', () => {
  test.setTimeout(240_000);
  test('public pages', async ({ page, seed }) => {
    for (const path of ['/', '/c/fashion', `/product/${seed.ids.linen}/linen-shirt`, '/search?q=shirt', '/deals', '/offers', '/faq', '/contact', '/privacy', '/login', '/register']) {
      await page.goto(path);
      await audit(page, path);
    }
  });
  test('public pages on a phone', async ({ page, seed }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of ['/', `/product/${seed.ids.linen}/linen-shirt`, '/search?q=shirt']) {
      await page.goto(path);
      await audit(page, `${path} (mobile)`);
    }
  });
  test('open menus and dialogs', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /All Categories/ }).click();
    await audit(page, 'All Categories open');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /select pin code/i }).click();
    await audit(page, 'location dialog');
  });
  test('buyer pages', async ({ page, buyer, seed }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added 1 to your cart.')).toBeVisible();
    for (const path of ['/cart', '/orders', '/account']) {
      await page.goto(path);
      await audit(page, path);
    }
  });
  test('vendor and admin dashboards', async ({ browser, admin }) => {
    const v = await approvedVendor(admin, API, { shop: 'A11y Shop' });
    const vp = await (await browser.newContext()).newPage();
    await uiLogin(vp, v.email, v.password);
    for (const path of ['/vendor', '/vendor/profile', '/vendor/products', '/vendor/products/new']) {
      await vp.goto(path);
      await audit(vp, path);
    }
    const ap = await (await browser.newContext()).newPage();
    await uiLogin(ap, 'e2e.admin@vpmart.example', 'E2eAdmin2026Pass');
    for (const path of ['/admin', '/admin/vendors', '/admin/users', '/admin/listings', '/admin/categories', '/admin/brands', '/admin/banners', '/admin/messages']) {
      await ap.goto(path);
      await audit(ap, path);
    }
    await v.api.dispose();
  });
});
