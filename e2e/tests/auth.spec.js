import { test, expect, uiLogin } from '../support/fixtures.js';
import { PASSWORD, unique } from '../support/api.js';

test.describe('registration and login (scenario 1)', () => {
  test('a buyer can register, sign out and sign back in', async ({ page }) => {
    const email = `${unique('reg')}@example.com`;
    await page.goto('/register');
    await expect(page.getByRole('link', { name: 'VP Mart home' })).toBeVisible();
    await page.getByLabel('Full name').fill('Asha Rao');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole('heading', { name: 'Hello, Asha' })).toBeVisible();
    await expect(page.getByText('Buyer', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByText('Hello, sign in')).toBeVisible();

    await uiLogin(page, email);
    await expect(page.getByRole('heading', { name: 'Hello, Asha' })).toBeVisible();
    await expect(page.getByText('Hello, Asha').first()).toBeVisible();
  });

  test('shows inline validation and a strength meter without calling the server', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Enter your full name')).toBeVisible();
    await expect(page.getByText('Enter a valid email address')).toBeVisible();
    await expect(page.getByText('Use at least 10 characters')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('abcdefghij1');
    await expect(page.getByText(/Strength:/)).toBeVisible();
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  });

  test('rejects wrong credentials and a duplicate email with clear messages', async ({ page, buyer }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(buyer.email);
    await page.getByLabel('Password', { exact: true }).fill('WrongPassw0rd!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/register');
    await page.getByLabel('Full name').fill('Dup User');
    await page.getByLabel('Email').fill(buyer.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('An account with this email already exists').first()).toBeVisible();
  });

  test('vendor and delivery-agent sign-ups are held for approval; admin cannot be registered', async ({ page, request }) => {
    const email = `${unique('ven')}@example.com`;
    await page.goto('/register');
    await page.getByLabel('Vendor').check();
    await page.getByLabel('Full name').fill('Vera Vendor');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Pending approval').first()).toBeVisible();
    await expect(page.getByText(/awaiting administrator approval/)).toBeVisible();

    const csrf = (await (await request.get('http://localhost:5100/api/auth/csrf')).json()).csrfToken;
    const res = await request.post('http://localhost:5100/api/auth/register', { headers: { 'x-csrf-token': csrf }, data: { name: 'Mallory', email: `${unique('adm')}@example.com`, password: PASSWORD, role: 'admin' } });
    expect(res.status()).toBe(422);
  });

  test('password reset request never reveals whether an email exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody-here@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If that email is registered');
  });
});
