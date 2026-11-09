import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge, Button, Form, Offcanvas } from 'react-bootstrap';
import { FiFilter, FiX } from 'react-icons/fi';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Pagination from '../components/Pagination.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { EmptyState, ErrorState, GridSkeleton } from '../components/states.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useCategories } from '../hooks/useCategories.js';
import { useSeo } from '../hooks/useSeo.js';
import { catalogService } from '../services/catalogService.js';
import { formatPaise, rupeesToPaise } from '../utils/money.js';

const SORTS = [
  ['relevance', 'Featured'],
  ['popularity', 'Popularity'],
  ['rating', 'Customer rating'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
];
const COLLECTIONS = {
  trending: ['Trending now', 'Products shoppers are viewing and buying right now.'],
  'best-sellers': ['Best sellers', 'The products that sell the most on VP Mart.'],
  deals: ['Today’s deals', 'Products currently discounted by at least 15% off their MRP.'],
  'new-arrivals': ['New arrivals', 'The latest products added by our sellers.'],
};

function Filters({ params, set, facets, tree, activeTop, onDone }) {
  // The panel is rendered twice (sidebar and phone drawer), so every id must be unique per copy.
  const uid = useId();
  const [min, setMin] = useState(params.get('minPrice') || '');
  const [max, setMax] = useState(params.get('maxPrice') || '');
  const [err, setErr] = useState('');
  const brands = (params.get('brand') || '').split(',').filter(Boolean);
  const toggleBrand = (slug) =>
    set({
      brand: (brands.includes(slug) ? brands.filter((b) => b !== slug) : [...brands, slug]).join(
        ',',
      ),
    });
  function applyPrice(e) {
    e.preventDefault();
    const lo = min ? rupeesToPaise(min) : null;
    const hi = max ? rupeesToPaise(max) : null;
    if ((min && lo == null) || (max && hi == null)) return setErr('Enter valid amounts');
    if (lo != null && hi != null && lo > hi) return setErr('Minimum cannot exceed maximum');
    setErr('');
    set({ minPrice: min ? String(lo / 100) : '', maxPrice: max ? String(hi / 100) : '' });
    onDone?.();
  }
  return (
    <div className="vp-filters">
      {tree.length > 0 && (
        <fieldset>
          <legend>Category</legend>
          <ul className="vp-fcat">
            {tree.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/c/${c.slug}`}
                  onClick={onDone}
                  className={activeTop === c.slug ? 'on' : ''}
                >
                  {c.name}
                </Link>
                {activeTop === c.slug && c.children.length > 0 && (
                  <ul>
                    {c.children.map((s) => (
                      <li key={s.id}>
                        <Link to={`/c/${s.slug}`} onClick={onDone}>
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {facets?.brands?.length > 0 && (
        <fieldset>
          <legend>Brand</legend>
          {facets.brands.map((b) => (
            <Form.Check
              key={b.id}
              id={`${uid}-brand-${b.slug}`}
              type="checkbox"
              label={
                <>
                  {b.name} <small className="text-secondary">({b.count})</small>
                </>
              }
              checked={brands.includes(b.slug)}
              onChange={() => toggleBrand(b.slug)}
            />
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Price (₹)</legend>
        <Form onSubmit={applyPrice} noValidate>
          <div className="d-flex gap-2 align-items-center">
            <Form.Control
              aria-label="Minimum price"
              inputMode="decimal"
              placeholder="Min"
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
            <span aria-hidden="true">–</span>
            <Form.Control
              aria-label="Maximum price"
              inputMode="decimal"
              placeholder="Max"
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
          {facets?.price && (
            <small className="text-secondary d-block mt-1">
              Available: {formatPaise(facets.price.minPaise)} to{' '}
              {formatPaise(facets.price.maxPaise)}
            </small>
          )}
          {err && (
            <div className="text-danger small mt-1" role="alert">
              {err}
            </div>
          )}
          <Button type="submit" size="sm" variant="outline-dark" className="mt-2">
            Apply
          </Button>
        </Form>
      </fieldset>
      <fieldset>
        <legend>Availability</legend>
        <Form.Check
          id={`${uid}-instock`}
          type="checkbox"
          label="In stock only"
          checked={params.get('inStock') === 'true'}
          onChange={(e) => set({ inStock: e.target.checked ? 'true' : '' })}
        />
      </fieldset>
    </div>
  );
}

export default function Browse({ collection, shop = false }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const tree = useCategories();
  const [drawer, setDrawer] = useState(false);

  const q = params.get('q') || '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sort = params.get('sort') || 'relevance';
  const categoryParam = shop ? '' : slug || params.get('category') || '';
  const query = useMemo(
    () => ({
      q: q || undefined,
      category: categoryParam ? categoryParam.split(',') : undefined,
      brand: (params.get('brand') || '').split(',').filter(Boolean),
      vendor: shop ? slug : undefined,
      minPrice: params.get('minPrice') || undefined,
      maxPrice: params.get('maxPrice') || undefined,
      inStock: params.get('inStock') === 'true' ? 'true' : undefined,
      collection,
      sort,
      page,
      limit: 24,
    }),
    [q, categoryParam, params, shop, slug, collection, sort, page],
  );
  const key = JSON.stringify(query);
  const results = useAsync(() => catalogService.search(query), [key]);
  const catInfo = useAsync(
    () => (slug && !shop ? catalogService.category(slug) : Promise.resolve(null)),
    [slug, shop],
  );
  const shopInfo = useAsync(
    () => (shop ? catalogService.shop(slug) : Promise.resolve(null)),
    [slug, shop],
  );

  // React Router's setSearchParams does not queue updates like setState: two quick changes made
  // before a re-render would both start from the same stale params and the second would undo the
  // first (e.g. removing a chip, then ticking a box). `pending` remembers the newest URL we asked for.
  const pending = useRef(null);
  // Cleared only after a render COMMITS with the new URL (never during render: transition
  // renders can be abandoned, which would leave handlers holding stale params).
  useEffect(() => {
    if (pending.current !== null && params.toString() === pending.current) pending.current = null;
  });
  const set = (patch) => {
    const next = new URLSearchParams(pending.current ?? params.toString());
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    const target = next.toString();
    pending.current = target;
    setTimeout(() => {
      if (pending.current === target) pending.current = null;
    }, 1500);
    setParams(next);
  };

  const [colTitle, colDesc] = COLLECTIONS[collection] || [];
  const cat = catInfo.data?.category;
  const title = shop
    ? shopInfo.data?.name || 'Shop'
    : colTitle || cat?.name || (q ? `Results for “${q}”` : 'All products');
  useSeo({
    title,
    description: cat?.description || colDesc || `Browse ${title} on VP Mart.`,
    path: shop ? `/shop/${slug}` : slug ? `/c/${slug}` : undefined,
    noindex: !!q,
  });

  const r = results.data;
  const activeTop = cat
    ? cat.parent
      ? tree.find((t) => t.id === cat.parent)?.slug
      : cat.slug
    : categoryParam.split(',')[0];
  const chips = [
    ...(params.get('brand') || '')
      .split(',')
      .filter(Boolean)
      .map((b) => ({
        k: `brand:${b}`,
        label: r?.facets.brands.find((x) => x.slug === b)?.name || b,
        clear: () =>
          set({
            brand: (params.get('brand') || '')
              .split(',')
              .filter((x) => x !== b)
              .join(','),
          }),
      })),
    ...(params.get('minPrice') || params.get('maxPrice')
      ? [
          {
            k: 'price',
            label: `₹${params.get('minPrice') || 0} – ${params.get('maxPrice') ? `₹${params.get('maxPrice')}` : 'any'}`,
            clear: () => set({ minPrice: '', maxPrice: '' }),
          },
        ]
      : []),
    ...(params.get('inStock') === 'true'
      ? [{ k: 'stock', label: 'In stock', clear: () => set({ inStock: '' }) }]
      : []),
  ];
  const filters = (
    <Filters
      params={params}
      set={set}
      facets={r?.facets}
      tree={tree}
      activeTop={activeTop}
      onDone={() => setDrawer(false)}
    />
  );

  if (slug && !shop && catInfo.error?.code === 'NOT_FOUND') {
    return (
      <EmptyState
        title="Category not found"
        action={
          <Link to="/" className="btn btn-dark">
            Back to home
          </Link>
        }
      >
        This category does not exist or is no longer available.
      </EmptyState>
    );
  }
  if (shop && shopInfo.error?.code === 'NOT_FOUND') {
    return (
      <EmptyState
        title="Shop not found"
        action={
          <Link to="/" className="btn btn-dark">
            Back to home
          </Link>
        }
      >
        This shop does not exist or has no products on sale.
      </EmptyState>
    );
  }

  return (
    <div className="container-xl vp-browse">
      <nav aria-label="Breadcrumb" className="vp-crumbs">
        <Link to="/">Home</Link>
        {cat?.parent && catInfo.data?.parent && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/c/${catInfo.data.parent.slug}`}>{catInfo.data.parent.name}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{title}</span>
      </nav>
      <header className="vp-browse-head">
        <div>
          <h1 className="vp-h1-page">{title}</h1>
          {(cat?.description || colDesc || shopInfo.data?.description) && (
            <p className="text-secondary mb-0">
              {cat?.description || colDesc || shopInfo.data?.description}
            </p>
          )}
        </div>
        <div className="vp-sort">
          <Button variant="outline-dark" className="vp-filter-btn" onClick={() => setDrawer(true)}>
            <FiFilter aria-hidden="true" /> Filters
            {chips.length > 0 && (
              <Badge bg="dark" className="ms-1">
                {chips.length}
              </Badge>
            )}
          </Button>
          <Form.Label htmlFor="sort" className="mb-0 text-secondary small">
            Sort by
          </Form.Label>
          <Form.Select
            id="sort"
            size="sm"
            value={sort}
            onChange={(e) => set({ sort: e.target.value === 'relevance' ? '' : e.target.value })}
          >
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Form.Select>
        </div>
      </header>
      {catInfo.data?.children?.length > 0 && (
        <ul className="vp-subcats" aria-label="Sub-categories">
          {catInfo.data.children.map((c) => (
            <li key={c.id}>
              <Link to={`/c/${c.slug}`}>
                {c.imageUrl && (
                  <img
                    src={c.imageUrl}
                    alt=""
                    width="22"
                    height="22"
                    className="vp-subcat-pill-img"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="vp-browse-body">
        <aside className="vp-aside" aria-label="Filters">
          {filters}
        </aside>
        <section aria-live="polite" aria-busy={results.loading}>
          {chips.length > 0 && (
            <ul className="vp-chips" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.k}>
                  <button type="button" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
                    {c.label} <FiX aria-hidden="true" />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="vp-clearall"
                  onClick={() =>
                    setParams(
                      new URLSearchParams([
                        ...(q ? [['q', q]] : []),
                        ...(!shop && !slug && categoryParam ? [['category', categoryParam]] : []),
                      ]),
                    )
                  }
                >
                  Clear all
                </button>
              </li>
            </ul>
          )}
          {results.loading && !r && <GridSkeleton />}
          {results.error && <ErrorState error={results.error} onRetry={results.reload} />}
          {r && (
            <>
              <p className="vp-count">
                {r.total === 0
                  ? 'No results'
                  : `${(r.page - 1) * r.limit + 1}–${Math.min(r.page * r.limit, r.total)} of ${r.total.toLocaleString('en-IN')} results`}
                {q && (
                  <>
                    {' '}
                    for <strong>“{q}”</strong>
                  </>
                )}
                {r.source === 'mongodb-fallback' && (
                  <Badge bg="warning" text="dark" className="ms-2">
                    Basic search mode
                  </Badge>
                )}
              </p>
              {r.items.length === 0 ? (
                <EmptyState
                  title="Nothing matches yet"
                  action={
                    <Link to="/" className="btn btn-dark">
                      Browse all categories
                    </Link>
                  }
                >
                  Try removing a filter, checking the spelling, or searching for something broader.
                </EmptyState>
              ) : (
                <div className={`vp-grid ${results.loading ? 'is-stale' : ''}`}>
                  {r.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
              <Pagination
                page={r.page}
                pages={r.pages}
                onChange={(n) => {
                  set({ page: n > 1 ? String(n) : '' });
                  window.scrollTo({ top: 0 });
                }}
              />
            </>
          )}
        </section>
      </div>
      <Offcanvas
        show={drawer}
        onHide={() => setDrawer(false)}
        placement="start"
        aria-labelledby="filters-title"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title id="filters-title">Filters</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>{filters}</Offcanvas.Body>
      </Offcanvas>
    </div>
  );
}
