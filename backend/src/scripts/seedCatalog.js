// npm run seed:catalog : creates the 18 required categories and their sub-categories.
import { runScript } from './run.js';
import { seedCategories } from '../services/seedCatalog.js';

runScript(async () => {
  const r = await seedCategories();
  console.log(`Categories: ${r.created} created, ${r.existing} already present, ${r.total} total.`);
});
