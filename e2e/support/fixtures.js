import fs from 'node:fs';
import { test as base, expect } from '@playwright/test';
import { Api, PASSWORD, registerUser } from './api.js';

const API = 'http://localhost:5100';
const state = () => JSON.parse(fs.readFileSync(new URL('../.state.json', import.meta.url), 'utf8'));

export const test = base.extend({
  seed: async ({}, use) => use(state()),
  // A fresh buyer account (created through the API) for the test.
  buyer: async ({}, use) => {
    const api = await Api.create(API);
    const u = await registerUser(api, { role: 'buyer', name: 'Asha Buyer' });
    await api.dispose();
    await use(u);
  },
  admin: async ({}, use) => {
    const api = await Api.create(API);
    await api.login('e2e.admin@vpmart.example', 'E2eAdmin2026Pass');
    await use(api);
    await api.dispose();
  },
});

export async function uiLogin(page, email, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
export { expect, API };
