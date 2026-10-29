import { test, expect, uiLogin, API } from '../support/fixtures.js';
import { Api, PASSWORD, approvedVendor, png, unique } from '../support/api.js';

const PHOTO = png();

test.describe('vendor onboarding and approval (scenario 8)', () => {
  test('a vendor completes the shop profile, an admin reviews it (masked bank details) and approves', async ({ page, browser }) => {
    const email = `${unique('vend')}@example.com`;
    const shop = `Green Basket ${unique('g')}`;
    await page.goto('/register');
    await page.getByLabel('Vendor').check();
    await page.getByLabel('Full name').fill('Ravi Kumar');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.goto('/vendor');
    await expect(page.getByText(/Complete your shop profile and submit it for approval/)).toBeVisible();
    await page.goto('/vendor/products');
    await expect(page.getByText('Your account is awaiting approval')).toBeVisible(); // enforced by the server

    await page.goto('/vendor/profile');
    await page.getByLabel('Shop name').fill(shop);
    await page.getByLabel('Registered business name').fill('Green Basket LLP');
    await page.getByLabel('Address line 1').fill('12 Mill Road');
    await page.getByLabel('City').fill('Coimbatore');
    await page.getByLabel('State').fill('Tamil Nadu');
    await page.getByLabel('PIN code').fill('641001');
    await page.getByLabel('Account holder name').fill('Ravi Kumar');
    await page.getByLabel('IFSC code').fill('hdfc0001234');
    await page.getByLabel('Bank account number').fill('123456789012');
    await page.getByRole('button', { name: 'Save and submit for approval' }).click();
    await expect(page.getByText('Submitted for approval. An administrator will review your shop.')).toBeVisible();

    await page.reload();
    await expect(page.getByText(/On file: ••••9012/)).toBeVisible();
    expect(await page.content()).not.toContain('123456789012');
    await expect(page.getByLabel('Shop name')).toHaveValue(shop);

    // The administrator reviews it in a separate browser session.
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await uiLogin(admin, 'e2e.admin@vpmart.example', 'E2eAdmin2026Pass');
    await admin.goto('/admin/vendors');
    await admin.getByLabel('Search vendors').fill(email);
    const row = admin.getByRole('row').filter({ hasText: shop });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Review' }).click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog).toContainText('••••9012');
    await expect(dialog).toContainText('Green Basket LLP');
    expect(await dialog.textContent()).not.toContain('123456789012');
    await dialog.getByLabel(/Reason/).fill('Documents verified');
    await dialog.getByRole('button', { name: 'Approve' }).click();
    await expect(dialog.getByText('Vendor is now active.')).toBeVisible();
    await adminCtx.close();

    await page.goto('/vendor');
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add a product' })).toBeVisible();
    await page.goto('/vendor/products');
    await expect(page.getByText('No products found')).toBeVisible();
  });

  test('an admin cannot approve a vendor who has not submitted a profile', async ({ page, admin }) => {
    const api = await Api.create(API);
    const v = await (async () => {
      const email = `${unique('np')}@example.com`;
      await api.ok(api.post('/api/auth/register', { name: 'No Profile', email, password: PASSWORD, role: 'vendor' }), 'register');
      return email;
    })();
    await uiLogin(page, 'e2e.admin@vpmart.example', 'E2eAdmin2026Pass');
    await page.goto('/admin/vendors');
    await page.getByLabel('Search vendors').fill(v);
    await page.getByRole('row').filter({ hasText: 'No Profile' }).getByRole('button', { name: 'Review' }).click();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await expect(page.getByText(/after the profile is submitted/)).toBeVisible();
    await api.dispose();
    expect(admin).toBeTruthy();
  });
});

test.describe('product management (scenario 9)', () => {
  test('create a product with an image, then change stock and availability', async ({ page, admin }) => {
    const v = await approvedVendor(admin, API, { shop: `Stock Shop ${unique('k')}` });
    const title = `Cotton Kurta ${unique('c')}`;
    await uiLogin(page, v.email, v.password);
    await page.goto('/vendor/products/new');
    await page.getByLabel('Product name').fill(title);
    await page.getByLabel('Brand (optional)').fill('Kaveri');
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Fashion' });
    await page.getByLabel('Sub-category').selectOption({ label: 'Women\'s Clothing' });
    await page.getByLabel('SKU').fill(`K-${unique('s')}`);
    await page.getByLabel('Selling price (₹)').fill('1,299.50');
    await page.getByLabel('MRP (₹)').fill('1999');
    await page.getByLabel('Stock (units)').fill('8');
    await page.getByLabel('Description').fill('A soft cotton kurta for everyday wear.');
    await page.locator('input[type=file]').setInputFiles(PHOTO);
    await expect(page.getByRole('button', { name: 'Remove image 1' })).toBeVisible();
    await page.getByLabel('Description for image 1').fill('Front view');
    await page.getByRole('button', { name: 'Create listing' }).click();

    await expect(page).toHaveURL(/\/vendor\/products$/);
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toContainText('₹1,299.50');
    await expect(row).toContainText('active');

    // It is on the public shop, with the right price.
    const shopper = await page.context().browser().newContext();
    const pub = await shopper.newPage();
    await pub.goto(`/search?q=${encodeURIComponent(title)}`);
    await pub.getByRole('link', { name: title }).click();
    await expect(pub.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(pub.getByText('₹1,299.50', { exact: true }).first()).toBeVisible();
    await expect(pub.getByText('In stock')).toBeVisible();
    const productUrl = pub.url();

    // Stock to zero: the buy button goes away. Stock back up: it returns.
    const stock = page.getByLabel(`Stock for ${title}`);
    await stock.fill('0');
    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('Out of stock');
    await pub.goto(productUrl);
    await expect(pub.getByRole('button', { name: 'Out of stock' })).toBeDisabled();
    await page.getByLabel(`Stock for ${title}`).fill('7');
    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).not.toContainText('Out of stock');
    await pub.goto(productUrl);
    await expect(pub.getByRole('button', { name: 'Add to cart' })).toBeEnabled();

    // Stop selling removes it from the shop but keeps the record; resuming restores it.
    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Stop selling' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Stop selling' }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('inactive');
    await pub.goto(productUrl);
    await expect(pub.getByText('This product isn’t available')).toBeVisible();
    await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Resume' }).click();
    await expect(page.getByRole('row').filter({ hasText: title })).toContainText('active');
    await pub.goto(productUrl);
    await expect(pub.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await shopper.close();
    await v.api.dispose();
  });

  test('editing a listing saves price changes that shoppers see immediately', async ({ page, admin }) => {
    const v = await approvedVendor(admin, API, { shop: `Edit Shop ${unique('e')}` });
    const title = `Edit Me ${unique('t')}`;
    const made = await v.api.ok(v.api.post('/api/vendor/listings', { product: { name: title, categoryId: (await v.api.get('/api/catalog/categories')).body.items.find((c) => c.slug === 'fashion').id }, sku: unique('E'), pricePaise: 50000, mrpPaise: 60000, stock: 3 }), 'create');
    await uiLogin(page, v.email, v.password);
    await page.goto(`/vendor/products/${made.listing.id}`);
    await expect(page.getByLabel('Selling price (₹)')).toHaveValue('500');
    await page.getByLabel('Selling price (₹)').fill('450');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Changes saved.')).toBeVisible();
    const pub = await (await page.context().browser().newContext()).newPage();
    await pub.goto(`/product/${made.listing.id}/x`);
    await expect(pub.getByText('₹450', { exact: true }).first()).toBeVisible();
    await v.api.dispose();
  });

  test('form validation: prices, SKU and image content are checked', async ({ page, admin }) => {
    const v = await approvedVendor(admin, API, { shop: `Val Shop ${unique('v')}` });
    await uiLogin(page, v.email, v.password);
    await page.goto('/vendor/products/new');
    await page.getByRole('button', { name: 'Create listing' }).click();
    await expect(page.getByText('Enter the product name')).toBeVisible();
    await expect(page.getByText('Choose a category')).toBeVisible();
    await expect(page.getByText('SKU is required')).toBeVisible();
    await page.getByLabel('Selling price (₹)').fill('500');
    await page.getByLabel('MRP (₹)').fill('400');
    await page.getByRole('button', { name: 'Create listing' }).click();
    await expect(page.getByText('MRP cannot be lower than the price')).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({ name: 'shell.png', mimeType: 'image/png', buffer: Buffer.from('<?php echo 1; ?>') });
    await expect(page.getByRole('alert').filter({ hasText: 'not a valid image' })).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 10) });
    await expect(page.getByRole('alert').filter({ hasText: '5 MB' })).toBeVisible();
    await v.api.dispose();
  });

  test('regulated and device categories change the form and enforce licences', async ({ page, admin }) => {
    const v = await approvedVendor(admin, API, { shop: `No Licence ${unique('n')}`, profile: { fssaiLicense: '', drugLicense: '' } });
    await uiLogin(page, v.email, v.password);
    await page.goto('/vendor/products/new');
    await expect(page.getByLabel('Model')).toHaveCount(0);
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Electronics' });
    await expect(page.getByLabel('Model')).toBeVisible();
    await expect(page.getByLabel('Device type')).toBeVisible();
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Fashion' });
    await expect(page.getByLabel('Model')).toHaveCount(0);

    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Groceries' });
    await page.getByLabel('Sub-category').selectOption({ label: 'Staples & Grains' });
    await expect(page.getByText(/requires an FSSAI licence/)).toBeVisible();
    await page.getByLabel('Product name').fill('Basmati Rice 1kg');
    await page.getByLabel('SKU').fill(unique('R'));
    await page.getByLabel('Selling price (₹)').fill('120');
    await page.getByLabel('MRP (₹)').fill('140');
    await page.getByLabel('Stock (units)').fill('10');
    await page.getByRole('button', { name: 'Create listing' }).click();
    await expect(page.getByText('Expiry date is required')).toBeVisible();
    await page.getByLabel(/Expiry/).fill('2030-01-01');
    await page.getByRole('button', { name: 'Create listing' }).click();
    await expect(page.getByText(/FSSAI licence number is required/)).toBeVisible(); // server-enforced

    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Medicines & Healthcare' });
    await page.getByLabel('Sub-category').selectOption({ label: 'Over-the-Counter' });
    await expect(page.getByLabel('Prescription required?')).toBeVisible();
    await v.api.dispose();
  });

  test('a vendor cannot open another vendor’s product', async ({ page, admin, seed }) => {
    const v = await approvedVendor(admin, API, { shop: `Snoop ${unique('o')}` });
    await uiLogin(page, v.email, v.password);
    await page.goto(`/vendor/products/${seed.ids.linen}`);
    await expect(page.getByText('Listing not found')).toBeVisible();
    await v.api.dispose();
  });
});
