import { test, expect, uiLogin, API } from '../support/fixtures.js';
import { Api, approvedVendor } from '../support/api.js';

const WIDTHS = [320, 390, 768, 1024, 1440, 1920];

async function assertFits(page, label, { header = true } = {}) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(m.sw, `${label}: horizontal overflow (${m.sw} > ${m.cw})`).toBeLessThanOrEqual(m.cw + 1);
  if (header) expect(await page.locator('header').count(), `${label}: header present`).toBeGreaterThan(0);
}
async function assertFooterBelowContent(page, label) {
  const footer = page.getByRole('contentinfo');
  if (!(await footer.count())) return;
  const f = await footer.boundingBox();
  const m = await page.locator('main').boundingBox();
  expect(m.y + m.height, `${label}: footer overlaps content`).toBeLessThanOrEqual(f.y + 1);
}

test.describe('responsive layouts (scenario 20)', () => {
  test.setTimeout(240_000);

  test('public pages fit every screen size without overflow or overlap', async ({ page, seed }) => {
    const pages = ['/', '/c/fashion', `/product/${seed.ids.linen}/linen-shirt`, '/search?q=shirt', '/deals', '/faq', '/contact', '/privacy', '/login', '/register', '/forgot-password'];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 500 ? 800 : 900 });
      for (const path of pages) {
        const auth = /login|register|forgot/.test(path);
        await page.goto(path);
        await page.locator(auth ? 'h1' : 'main h1, main h2').first().waitFor();
        await page.waitForTimeout(250);
        await assertFits(page, `${path} @${w}`, { header: !auth });
        if (!auth) await assertFooterBelowContent(page, `${path} @${w}`);
      }
    }
  });

  test('buyer pages fit every screen size', async ({ page, buyer, seed }) => {
    await uiLogin(page, buyer.email, buyer.password);
    await page.goto(`/product/${seed.ids.linen}/linen-shirt`);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added 1 to your cart.')).toBeVisible();
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      for (const path of ['/cart', '/orders', '/account']) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        await assertFits(page, `${path} @${w}`);
        await assertFooterBelowContent(page, `${path} @${w}`);
      }
    }
  });

  test('vendor and admin dashboards fit phone, tablet and desktop', async ({ browser, admin }) => {
    const v = await approvedVendor(admin, API, { shop: 'Responsive Shop' });
    const run = async (email, password, paths) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await uiLogin(page, email, password);
      for (const w of [390, 768, 1440]) {
        await page.setViewportSize({ width: w, height: 800 });
        for (const path of paths) {
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(300);
          const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
          expect(m.sw, `${path} @${w}: horizontal overflow`).toBeLessThanOrEqual(m.cw + 1);
        }
      }
      await ctx.close();
    };
    await run(v.email, v.password, ['/vendor', '/vendor/profile', '/vendor/products', '/vendor/products/new']);
    await run('e2e.admin@vpmart.example', 'E2eAdmin2026Pass', ['/admin', '/admin/vendors', '/admin/users', '/admin/listings', '/admin/categories', '/admin/brands', '/admin/banners', '/admin/messages']);
    await v.api.dispose();
    expect(Api).toBeTruthy();
  });

  test('the layout adapts: navigation collapses on small screens and expands on large ones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: /All Categories/ })).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
    await expect(page.getByRole('button', { name: /All Categories/ })).toBeVisible();
    await expect(page.getByText('IN · ₹ INR')).toBeVisible();
  });

  test('product grids use more columns on wider screens', async ({ page }) => {
    const cols = async (w) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('/c/fashion');
      await expect(page.locator('.vp-card').first()).toBeVisible();
      return page.evaluate(() => getComputedStyle(document.querySelector('.vp-grid')).gridTemplateColumns.split(' ').length);
    };
    const [phone, desktop] = [await cols(390), await cols(1440)];
    expect(phone).toBeLessThanOrEqual(2);
    expect(desktop).toBeGreaterThan(phone);
  });
});
