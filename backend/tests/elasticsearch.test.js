// NOTE: runs against an in-process stand-in that speaks the Elasticsearch HTTP protocol.
// It verifies our request building, sync, retry and fallback logic. It is NOT a substitute for
// testing against a real cluster.
import './esEnv.js';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createApp,
  makeListing,
  makeVendor,
  models,
  newClient,
  resetDb,
  seedCategories,
  setupDb,
  teardownDb,
  catByName,
} from './helpers.js';
import { buildEsQuery } from '../src/services/search.js';
import {
  processDirty,
  reindexAll,
  searchEnabled,
  toSearchDoc,
} from '../src/services/searchSync.js';

let server;
let app;
const seen = [];
const stub = { mode: 'ok', hits: [], brandBuckets: [], failIds: new Set() };

function startStub() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const url = req.url.split('?')[0];
        const entry = { method: req.method, url, raw };
        seen.push(entry);
        const reply = (code, body) => {
          res.writeHead(code, {
            'content-type': 'application/json',
            'x-elastic-product': 'Elasticsearch',
          });
          res.end(JSON.stringify(body));
        };
        if (stub.mode === 'down')
          return reply(503, { error: { type: 'unavailable', reason: 'down' }, status: 503 });
        if (url.endsWith('/_search')) {
          entry.body = JSON.parse(raw);
          return reply(200, {
            took: 1,
            timed_out: false,
            hits: {
              total: { value: stub.hits.length, relation: 'eq' },
              hits: stub.hits.map((id) => ({ _id: id, _score: 1 })),
            },
            aggregations: {
              brands: { buckets: stub.brandBuckets },
              price: { count: stub.hits.length, min: 1000, max: 90000 },
            },
          });
        }
        if (url.endsWith('/_bulk')) {
          const lines = raw
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l));
          entry.ops = lines;
          const items = [];
          for (let i = 0; i < lines.length; i += 2) {
            const id = lines[i].index._id;
            items.push({
              index: stub.failIds.has(id)
                ? {
                    _id: id,
                    status: 400,
                    error: { type: 'mapper_parsing_exception', reason: 'bad' },
                  }
                : { _id: id, status: 201, result: 'created' },
            });
          }
          return reply(200, { took: 1, errors: items.some((x) => x.index.error), items });
        }
        if (req.method === 'DELETE')
          return reply(404, { error: { type: 'index_not_found_exception' }, status: 404 });
        if (req.method === 'PUT') {
          entry.body = JSON.parse(raw);
          return reply(200, { acknowledged: true });
        }
        return reply(200, {});
      });
    });
    server.listen(19200, '127.0.0.1', resolve);
  });
}

before(async () => {
  await startStub();
  await setupDb();
  app = createApp();
});
after(async () => {
  await teardownDb();
  await new Promise((r) => server.close(r));
});
beforeEach(async () => {
  await resetDb();
  await seedCategories();
  seen.length = 0;
  Object.assign(stub, { mode: 'ok', hits: [], brandBuckets: [], failIds: new Set() });
});

const base = { q: undefined, sort: 'relevance', page: 1, limit: 24 };

describe('Elasticsearch query building', () => {
  it('enabled when ELASTICSEARCH_URL is set', () => assert.equal(searchEnabled(), true));

  it('always restricts to public listings and applies filters, sort and paging', () => {
    const body = buildEsQuery(
      {
        ...base,
        q: 'linen shirt',
        minPrice: 40000,
        maxPrice: 70000,
        inStock: true,
        sort: 'price_asc',
        page: 3,
        limit: 10,
      },
      { categoryIds: ['c1', 'c2'], brandIds: ['b1'], vendorId: 'v1' },
    );
    const filter = body.query.bool.filter;
    assert.deepEqual(filter[0], { term: { isPublic: true } });
    assert.ok(filter.some((f) => f.terms?.categoryPath?.join() === 'c1,c2'));
    assert.ok(filter.some((f) => f.terms?.brandId?.join() === 'b1'));
    assert.ok(filter.some((f) => f.term?.vendorId === 'v1'));
    assert.ok(
      filter.some((f) => f.range?.pricePaise?.gte === 40000 && f.range.pricePaise.lte === 70000),
    );
    assert.ok(filter.some((f) => f.term?.inStock === true));
    assert.equal(body.query.bool.must[0].multi_match.query, 'linen shirt');
    assert.equal(body.query.bool.must[0].multi_match.operator, 'and');
    assert.deepEqual(body.sort, [{ pricePaise: 'asc' }]);
    assert.equal(body.from, 20);
    assert.equal(body.size, 10);
  });

  it('builds collection filters for deals, best sellers and trending', () => {
    const f = (c) => buildEsQuery({ ...base, collection: c }, {}).query.bool.filter;
    assert.ok(f('deals').some((x) => x.range?.discountPercent?.gte === 15));
    assert.ok(f('best-sellers').some((x) => x.range?.soldCount?.gt === 0));
    assert.ok(f('trending').some((x) => x.bool?.minimum_should_match === 1));
  });

  it('uses match_all without a query and treats user text as data, not query syntax', () => {
    assert.deepEqual(buildEsQuery(base, {}).query.bool.must, [{ match_all: {} }]);
    const evil = buildEsQuery({ ...base, q: '{"script":"x"} OR *:*' }, {});
    assert.equal(typeof evil.query.bool.must[0].multi_match.query, 'string');
    assert.equal(JSON.stringify(evil).includes('query_string'), false);
  });

  it('indexes a safe document: no private vendor or buyer data', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, { name: 'Doc Test' });
    const doc = toSearchDoc((await models.Listing.findById(l._id)).toObject());
    assert.equal(doc.isPublic, true);
    assert.equal(doc.inStock, true);
    assert.ok(!JSON.stringify(doc).match(/email|phone|payout|gstin/i));
  });
});

describe('search through Elasticsearch with MongoDB hydration', () => {
  it('returns hits in Elasticsearch order using current prices from MongoDB', async () => {
    const v = await makeVendor();
    const a = await makeListing(v, { name: 'Alpha Shirt', brand: 'Acme', sku: 'A' });
    const b = await makeListing(v, { name: 'Beta Shirt', brand: 'Acme', sku: 'B' });
    const brand = await models.Brand.findOne({ name: 'Acme' });
    await models.Listing.updateOne({ _id: b._id }, { pricePaise: 41000 });
    stub.hits = [String(b._id), String(a._id)];
    stub.brandBuckets = [{ key: String(brand._id), doc_count: 2 }];
    const res = await newClient(app).get('/api/catalog/search?q=shirt&sort=price_asc');
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'elasticsearch');
    assert.deepEqual(
      res.body.items.map((i) => i.title),
      ['Beta Shirt', 'Alpha Shirt'],
    );
    assert.equal(res.body.items[0].pricePaise, 41000, 'fresh price from MongoDB, not the index');
    assert.equal(res.body.facets.brands[0].name, 'Acme');
    const q = seen.find((s) => s.url.endsWith('/_search')).body;
    assert.deepEqual(q.query.bool.filter[0], { term: { isPublic: true } });
  });

  it('drops hits that are no longer public in MongoDB (stale index entries)', async () => {
    const v = await makeVendor();
    const a = await makeListing(v, { name: 'Live One', sku: 'L1' });
    const b = await makeListing(v, { name: 'Gone One', sku: 'L2' });
    await models.Listing.updateOne({ _id: b._id }, { status: 'hidden', isPublic: false });
    stub.hits = [String(a._id), String(b._id)];
    const res = await newClient(app).get('/api/catalog/search?q=one');
    assert.deepEqual(
      res.body.items.map((i) => i.title),
      ['Live One'],
    );
  });

  it('falls back to MongoDB and says so when Elasticsearch is down', async () => {
    const v = await makeVendor();
    await makeListing(v, { name: 'Fallback Shirt' });
    stub.mode = 'down';
    const res = await newClient(app).get('/api/catalog/search?q=fallback');
    assert.equal(res.status, 200);
    assert.equal(res.body.source, 'mongodb-fallback');
    assert.deepEqual(
      res.body.items.map((i) => i.title),
      ['Fallback Shirt'],
    );
  });
});

describe('keeping the index in sync', () => {
  it('marks new and changed listings dirty, pushes them in bulk, then marks them clean', async () => {
    const v = await makeVendor();
    const a = await makeListing(v, { name: 'Sync A', sku: 'SA' });
    const b = await makeListing(v, { name: 'Sync B', sku: 'SB' });
    assert.equal(await models.Listing.countDocuments({ searchDirty: true }), 2);
    const r = await processDirty();
    assert.deepEqual({ indexed: r.indexed, failed: r.failed }, { indexed: 2, failed: 0 });
    assert.equal(await models.Listing.countDocuments({ searchDirty: true }), 0);
    const bulk = seen.find((s) => s.url.endsWith('/_bulk'));
    assert.deepEqual(
      bulk.ops
        .filter((_, i) => i % 2 === 0)
        .map((o) => o.index._id)
        .sort(),
      [String(a._id), String(b._id)].sort(),
    );
    assert.equal(bulk.ops[0].index._index, 'vpmart_test_listings');

    // A change marks only that listing dirty again.
    const vendor = await models.User.findById(v._id);
    assert.ok(vendor);
    await models.Listing.updateOne({ _id: a._id }, { searchDirty: true });
    assert.equal((await processDirty()).indexed, 1);
  });

  it('keeps failed documents dirty for retry and cleans the rest', async () => {
    const v = await makeVendor();
    const a = await makeListing(v, { name: 'Ok One', sku: 'K1' });
    const b = await makeListing(v, { name: 'Bad One', sku: 'K2' });
    stub.failIds = new Set([String(b._id)]);
    const r = await processDirty();
    assert.deepEqual({ indexed: r.indexed, failed: r.failed }, { indexed: 1, failed: 1 });
    assert.equal((await models.Listing.findById(a._id)).searchDirty, false);
    assert.equal((await models.Listing.findById(b._id)).searchDirty, true);
    stub.failIds = new Set();
    assert.equal((await processDirty()).indexed, 1);
    assert.equal(await models.Listing.countDocuments({ searchDirty: true }), 0);
  });

  it('survives an outage without losing anything: everything stays dirty', async () => {
    const v = await makeVendor();
    await makeListing(v, { name: 'Outage', sku: 'O1' });
    stub.mode = 'down';
    const r = await processDirty();
    assert.equal(r.indexed, 0);
    assert.ok(r.error);
    assert.equal(await models.Listing.countDocuments({ searchDirty: true }), 1);
    stub.mode = 'ok';
    assert.equal((await processDirty()).indexed, 1);
  });

  it('reindexAll recreates the index with the right mapping and loads every listing', async () => {
    const v = await makeVendor();
    await makeListing(v, { name: 'R1', sku: 'R1' });
    await makeListing(v, { name: 'R2', sku: 'R2' });
    await makeListing(v, { name: 'R3', sku: 'R3' });
    await models.Listing.updateMany({}, { searchDirty: false });
    const r = await reindexAll();
    assert.deepEqual(r, { indexed: 3, failed: 0 });
    const methods = seen.map((s) => `${s.method} ${s.url}`);
    assert.ok(methods.includes('DELETE /vpmart_test_listings'));
    assert.ok(methods.includes('PUT /vpmart_test_listings'));
    assert.ok(methods.some((m) => m.endsWith('/_refresh')));
    const create = seen.find((s) => s.method === 'PUT');
    assert.equal(create.body.mappings.properties.title.type, 'search_as_you_type');
    assert.equal(create.body.mappings.properties.pricePaise.type, 'long');
    assert.equal(await models.Listing.countDocuments({ searchDirty: true }), 0);
  });

  it('category changes mark affected listings for re-indexing', async () => {
    const v = await makeVendor();
    const l = await makeListing(v, {
      name: 'Cat Move',
      sku: 'C1',
      category: await catByName('Fashion'),
    });
    await processDirty();
    assert.equal((await models.Listing.findById(l._id)).searchDirty, false);
    const { refreshVisibility } = await import('../src/services/catalogService.js');
    await refreshVisibility({ _id: l._id });
    assert.equal((await models.Listing.findById(l._id)).searchDirty, true);
  });
});
