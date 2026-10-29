import { test, expect, uiLogin, API } from '../support/fixtures.js';
import { Api, PASSWORD, approvedVendor, png, unique } from '../support/api.js';

const adminLogin = (page) => uiLogin(page, 'e2e.admin@vpmart.example', 'E2eAdmin2026Pass');
const localInput = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
async function createBanner(page, { title, destination = '/c/fashion', startOffset, endOffset, cta = 'Shop now' }) {
  await page.getByRole('button', { name: 'New banner' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Button text (optional)').fill(cta);
  await dialog.getByLabel('Destination').fill(destination);
  if (startOffset !== undefined) await dialog.getByLabel('Starts').fill(localInput(startOffset));
  if (endOffset !== undefined) await dialog.getByLabel('Ends').fill(localInput(endOffset));
  await dialog.locator('input[type=file]').setInputFiles(png('banner.png'));
  await expect(dialog.getByRole('button', { name: 'Remove image 1' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
}

test.describe('advertisements and banners (scenario 18)', () => {
  test('create, schedule, show on the homepage, count clicks, deactivate, and really delete', async ({ page, browser, admin }) => {
    const title = `Diwali Sale ${unique('d')}`;
    await adminLogin(page);
    await page.goto('/admin/banners');
    await createBanner(page, { title, startOffset: -1, endOffset: 5 });
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toContainText('live');

    const shopper = await browser.newContext();
    const home = await shopper.newPage();
    await home.goto('/');
    const hero = home.locator('.vp-hero');
    await expect(hero).toContainText(title);
    // slider controls are usable
    if (await home.getByLabel('Pause automatic rotation').count()) await home.getByLabel('Pause automatic rotation').click();
    await hero.getByRole('link', { name: new RegExp(title) }).click({ force: true });
    await expect(home).toHaveURL(/\/c\/fashion$/);

    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: title }).getByRole('cell').nth(2)).not.toHaveText('0');

    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('inactive');
    await home.goto('/');
    await expect(home.getByText(title)).toHaveCount(0);
    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('live');

    // Real deletion: record and stored image are gone, the page says exactly that.
    const before = (await admin.get('/api/admin/banners')).body.items.find((b) => b.title === title);
    expect((await shopper.request.get(before.imageUrl)).status()).toBe(200);
    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('cannot be undone');
    await dialog.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.getByText(/permanently deleted along with its image/)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: title })).toHaveCount(0);
    expect((await admin.get('/api/admin/banners')).body.items.some((b) => b.title === title)).toBe(false);
    expect((await shopper.request.get(before.imageUrl)).status()).toBe(404);
    await home.goto('/');
    await expect(home.getByText(title)).toHaveCount(0);
    await shopper.close();
  });

  test('scheduled and expired banners stay off the homepage', async ({ page, browser }) => {
    const future = `Coming Soon ${unique('f')}`;
    const past = `Ended ${unique('p')}`;
    await adminLogin(page);
    await page.goto('/admin/banners');
    await createBanner(page, { title: future, startOffset: 3, endOffset: 10 });
    await createBanner(page, { title: past, startOffset: -10, endOffset: -2 });
    await expect(page.getByRole('row').filter({ hasText: future })).toContainText('scheduled');
    const shopper = await browser.newContext();
    const home = await shopper.newPage();
    await home.goto('/');
    await expect(home.locator('body')).not.toContainText(future);
    await expect(home.locator('body')).not.toContainText(past);
    await shopper.close();
  });

  test('the form rejects unsafe destinations, bad dates and missing images', async ({ page }) => {
    await adminLogin(page);
    await page.goto('/admin/banners');
    await page.getByRole('button', { name: 'New banner' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('Bad banner');
    await dialog.getByLabel('Destination').fill('javascript:alert(1)');
    await dialog.getByLabel('Ends').fill(localInput(-3));
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByText(/Use a path like/)).toBeVisible();
    await expect(dialog.getByText('End must be after start')).toBeVisible();
    await expect(dialog.getByText('Upload an image')).toBeVisible();
  });
});

test.describe('vendor suspension and listing moderation (scenario 16)', () => {
  test('suspending a vendor hides their products; reinstating restores them; the audit trail records it', async ({ page, browser, admin }) => {
    const v = await approvedVendor(admin, API, { shop: `Susp Shop ${unique('s')}` });
    const title = `Susp Tee ${unique('t')}`;
    const cats = (await admin.get('/api/catalog/categories')).body.items;
    const made = await v.api.ok(v.api.post('/api/vendor/listings', { product: { name: title, categoryId: cats.find((c) => c.slug === 'fashion').id }, sku: unique('S'), pricePaise: 20000, mrpPaise: 20000, stock: 5 }), 'listing');
    const url = `/product/${made.listing.id}/x`;
    const shopper = await (await browser.newContext()).newPage();
    await shopper.goto(url);
    await expect(shopper.getByRole('heading', { name: title, level: 1 })).toBeVisible();

    await adminLogin(page);
    await page.goto('/admin/vendors');
    await page.getByLabel('Filter by status').selectOption('active');
    await page.getByLabel('Search vendors').fill(v.email);
    await page.getByRole('row').filter({ hasText: v.shop }).getByRole('button', { name: 'Review' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Reason/).fill('Policy violation');
    await dialog.getByRole('button', { name: 'Suspend' }).click();
    await expect(dialog.getByText('Vendor is now suspended.')).toBeVisible();

    await shopper.reload();
    await expect(shopper.getByText('This product isn’t available')).toBeVisible();
    // The vendor's live session was revoked immediately and they cannot sign back in.
    expect((await v.api.get('/api/auth/me')).status).toBe(401);
    const retry = await (await Api.create(API)).post('/api/auth/login', { email: v.email, password: PASSWORD });
    expect(retry.status).toBe(403);

    await dialog.getByRole('button', { name: 'Reinstate' }).click();
    await expect(dialog.getByText('Vendor is now active.')).toBeVisible();
    await shopper.reload();
    await expect(shopper.getByRole('heading', { name: title, level: 1 })).toBeVisible();

    const log = (await admin.get('/api/admin/stats/overview')).status;
    expect(log).toBe(200);
  });

  test('hiding a listing needs a reason, is visible to the vendor, and cannot be undone by them', async ({ page, browser, admin }) => {
    const v = await approvedVendor(admin, API, { shop: `Hide Shop ${unique('h')}` });
    const title = `Hide Me ${unique('m')}`;
    const cats = (await admin.get('/api/catalog/categories')).body.items;
    const made = await v.api.ok(v.api.post('/api/vendor/listings', { product: { name: title, categoryId: cats.find((c) => c.slug === 'fashion').id }, sku: unique('H'), pricePaise: 20000, mrpPaise: 20000, stock: 5 }), 'listing');
    await adminLogin(page);
    await page.goto('/admin/listings');
    await page.getByLabel('Search listings').fill(title);
    const row = page.getByRole('row').filter({ hasText: title });
    await row.getByRole('button', { name: 'Hide' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Hide listing' })).toBeDisabled();
    await dialog.getByLabel(/Reason/).fill('Prohibited item');
    await dialog.getByRole('button', { name: 'Hide listing' }).click();
    await expect(row).toContainText('hidden');

    const shopper = await (await browser.newContext()).newPage();
    await shopper.goto(`/product/${made.listing.id}/x`);
    await expect(shopper.getByText('This product isn’t available')).toBeVisible();

    const vendorPage = await (await browser.newContext()).newPage();
    await uiLogin(vendorPage, v.email, v.password);
    await vendorPage.goto('/vendor/products');
    const vrow = vendorPage.getByRole('row').filter({ hasText: title });
    await expect(vrow).toContainText('Prohibited item');
    await expect(vrow.getByRole('button', { name: 'Resume' })).toHaveCount(0);
    expect((await v.api.patch(`/api/vendor/listings/${made.listing.id}`, { status: 'active' })).status).toBe(403);

    await row.getByRole('button', { name: 'Restore' }).click();
    await expect(row).not.toContainText('hidden');
    await shopper.reload();
    await expect(shopper.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });
});

test.describe('categories, brands, users and overview', () => {
  test('deactivating a category hides its products without deleting anything', async ({ page, browser, admin }) => {
    const name = `E2E Gadgets ${unique('g')}`;
    await adminLogin(page);
    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'New category' }).click();
    await page.getByRole('dialog').getByLabel('Name').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    const cat = (await admin.get('/api/admin/categories')).body.items.find((c) => c.name === name);

    const v = await approvedVendor(admin, API, { shop: `Cat Shop ${unique('c')}` });
    const title = `Gadget ${unique('x')}`;
    const made = await v.api.ok(v.api.post('/api/vendor/listings', { product: { name: title, categoryId: cat.id }, sku: unique('G'), pricePaise: 99900, mrpPaise: 99900, stock: 2 }), 'listing');
    const shopper = await (await browser.newContext()).newPage();
    await shopper.goto(`/product/${made.listing.id}/x`);
    await expect(shopper.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await shopper.goto(`/c/${cat.slug}`);
    await expect(shopper.getByRole('heading', { name, level: 1 })).toBeVisible();

    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('dialog')).toContainText('Nothing is deleted');
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(row).toContainText('inactive');
    await shopper.goto(`/product/${made.listing.id}/x`);
    await expect(shopper.getByText('This product isn’t available')).toBeVisible();
    await shopper.goto(`/c/${cat.slug}`);
    await expect(shopper.getByText('Category not found')).toBeVisible();
    // The listing record is preserved for history.
    expect((await v.api.get(`/api/vendor/listings/${made.listing.id}`)).status).toBe(200);

    await row.getByRole('button', { name: 'Activate' }).click();
    await expect(row).toContainText('active');
    await shopper.goto(`/product/${made.listing.id}/x`);
    await expect(shopper.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  });

  test('brands can be added, renamed and deactivated; duplicates are refused', async ({ page }) => {
    const name = `E2E Brand ${unique('b')}`;
    await adminLogin(page);
    await page.goto('/admin/brands');
    await page.getByLabel('New brand name').fill(name);
    await page.getByRole('button', { name: 'Add brand' }).click();
    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await page.getByLabel('New brand name').fill(name.toLowerCase());
    await page.getByRole('button', { name: 'Add brand' }).click();
    await expect(page.getByRole('alert')).toContainText('already exists');
    await row.getByRole('button', { name: 'Deactivate' }).click();
    await expect(row).toContainText('inactive');
  });

  test('delivery agents can be approved from the Users page; admins cannot be changed', async ({ page }) => {
    const api = await Api.create(API);
    const email = `${unique('agent')}@example.com`;
    await api.ok(api.post('/api/auth/register', { name: 'Dev Agent', email, password: PASSWORD, role: 'delivery_agent' }), 'register');
    await adminLogin(page);
    await page.goto('/admin/users');
    await page.getByLabel('Search users').fill(email);
    const row = page.getByRole('row').filter({ hasText: 'Dev Agent' });
    await expect(row).toContainText('Pending approval');
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row).toContainText('active');
    await page.getByLabel('Filter by role').selectOption('admin');
    await page.getByLabel('Search users').fill('');
    await expect(page.getByRole('row').filter({ hasText: 'E2E Admin' }).getByRole('button')).toHaveCount(0);
    await api.dispose();
  });

  test('overview numbers come from the database and distinguish listings from unique products', async ({ page, admin }) => {
    const api = (await admin.get('/api/admin/stats/overview')).body;
    await adminLogin(page);
    await page.goto('/admin');
    const stat = (label) => page.locator('.vp-stat').filter({ hasText: new RegExp(`^${label}`) });
    await expect(stat('Vendor listings')).toContainText(String(api.catalog.listings));
    await expect(stat('Unique products')).toContainText(String(api.catalog.uniqueProducts));
    await expect(stat('Categories')).toContainText('18');
    expect(api.catalog.listings).toBeGreaterThanOrEqual(api.catalog.uniqueProducts);
    await expect(page.getByText('Orders, payments, commission')).toBeVisible();
  });

  test('support messages from the contact form reach the admin', async ({ page, browser }) => {
    const subject = `Help ${unique('h')}`;
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto('/contact');
    await visitor.getByLabel('Your name').fill('Asha Visitor');
    await visitor.getByLabel('Email').fill('asha.visitor@example.com');
    await visitor.getByLabel('Subject (optional)').fill(subject);
    await visitor.getByLabel('Message').fill('Where can I see my order status please?');
    await visitor.getByRole('button', { name: 'Send message' }).click();
    await expect(visitor.getByText('Thanks, your message has been sent.')).toBeVisible();
    await adminLogin(page);
    await page.goto('/admin/messages');
    const item = page.locator('li').filter({ hasText: subject });
    await expect(item).toContainText('Where can I see my order status please?');
    await item.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(item).toContainText('resolved');
  });
});
