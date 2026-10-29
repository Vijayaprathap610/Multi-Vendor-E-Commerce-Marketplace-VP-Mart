import fs from 'node:fs/promises';
import { Api, approvedVendor } from './api.js';

const API = 'http://localhost:5100';
const future = () => new Date(Date.now() + 200 * 86400000).toISOString();

// Seeds a shop and a small catalogue through the real API once per run.
export default async function globalSetup() {
  const admin = await Api.create(API);
  await admin.login('e2e.admin@vpmart.example', 'E2eAdmin2026Pass');
  const cats = (await admin.ok(admin.get('/api/catalog/categories'), 'categories')).items;
  const find = (slug) => cats.find((c) => c.slug === slug) || cats.flatMap((c) => c.children).find((c) => c.slug === slug);
  const top = (slug) => find(slug).id;
  const sub = (parent, slug) => ({ categoryId: top(parent), subcategoryId: find(slug).id });

  const vendor = await approvedVendor(admin, API, { shop: 'Seed Shop' });
  const mk = async (name, product, rest) => {
    const res = await vendor.api.ok(vendor.api.post('/api/vendor/listings', { product: { name, ...product }, ...rest }), `listing ${name}`);
    return res.listing.id;
  };
  const ids = {
    linen: await mk('Linen Shirt', { brand: { name: 'Acme' }, ...sub('fashion', 'mens-clothing'), description: 'A breathable linen shirt for warm days.' }, { sku: 'E2E-LINEN', pricePaise: 49900, mrpPaise: 79900, stock: 10, attributes: { Material: 'Linen' } }),
    denim: await mk('Denim Shirt', { brand: { name: 'Bolt' }, ...sub('fashion', 'mens-clothing') }, { sku: 'E2E-DENIM', pricePaise: 89900, mrpPaise: 89900, stock: 0 }),
    trousers: await mk('Cotton Trousers', { brand: { name: 'Acme' }, categoryId: top('fashion') }, { sku: 'E2E-TROUS', pricePaise: 69900, mrpPaise: 69900, stock: 4 }),
    iceCream: await mk('Vanilla Ice Cream', { brand: { name: 'Frostbite' }, ...sub('ice-cream', 'ice-cream-tubs') }, { sku: 'E2E-ICE', pricePaise: 12000, mrpPaise: 12000, stock: 30, expiryDate: future() }),
    phone: await mk('Nova 5G Phone', { brand: { name: 'Novatech' }, ...sub('electronics', 'mobiles'), model: 'N5', version: 'Gen 2', deviceType: 'Smartphone' }, { sku: 'E2E-PHONE', pricePaise: 1899900, mrpPaise: 2199900, stock: 5 }),
    rice: await mk('Sona Masoori Rice 5kg', { brand: { name: 'Annapurna' }, ...sub('groceries', 'staples-grains') }, { sku: 'E2E-RICE', pricePaise: 44900, mrpPaise: 49900, stock: 50, expiryDate: future() }),
  };
  await fs.writeFile(new URL('../.state.json', import.meta.url), JSON.stringify({ ids, vendor: { email: vendor.email, password: vendor.password, shop: vendor.shop } }, null, 2));
  await admin.dispose();
  await vendor.api.dispose();
}
