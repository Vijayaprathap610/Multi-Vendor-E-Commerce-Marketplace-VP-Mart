// npm run import:fakestore : optional one-time import of sample products (run `seed:catalog` first).
// FAKESTORE_URL, FAKESTORE_USD_INR (default 83) and FAKESTORE_STOCK (default 25) are optional.
import { runScript } from './run.js';
import { importFakeStore } from '../services/importFakeStore.js';

runScript(async () => {
  const r = await importFakeStore({
    url: process.env.FAKESTORE_URL || undefined,
    usdToInr: Number(process.env.FAKESTORE_USD_INR || 83),
    stock: Number(process.env.FAKESTORE_STOCK || 25),
  });
  console.log(
    `Fetched ${r.fetched}: imported ${r.imported}, skipped ${r.skipped} (already present), failed ${r.failed}, images unavailable ${r.imageFailed}.`,
  );
  console.log(`Verified in database: ${r.vendorListingsInDb} sample listings.`);
  for (const e of r.errors) console.log(`  - ${e}`);
  if (r.failed && !r.imported && !r.skipped) throw new Error('Nothing could be imported.');
});
