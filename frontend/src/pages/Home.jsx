import { Link } from 'react-router-dom';
import BannerSlider from '../components/BannerSlider.jsx';
import ProductRail from '../components/ProductRail.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/states.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { catalogService } from '../services/catalogService.js';

function CategoryTiles({ items }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="home-cats" className="vp-section">
      <h2 id="home-cats" className="vp-rail-title mb-3">
        Shop by category
      </h2>
      <ul className="vp-tiles">
        {items.map((c) => (
          <li key={c.id}>
            <Link to={`/c/${c.slug}`} className="vp-tile">
              {c.imageUrl ? (
                <img src={c.imageUrl} alt="" loading="lazy" width="120" height="120" />
              ) : (
                <span className="vp-tile-mono" aria-hidden="true">
                  {c.name[0]}
                </span>
              )}
              <span className="vp-tile-name">{c.name}</span>
              <small>
                {c.listingCount} {c.listingCount === 1 ? 'product' : 'products'}
              </small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Brands({ items }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="home-brands" className="vp-section">
      <h2 id="home-brands" className="vp-rail-title mb-3">
        Popular brands
      </h2>
      <ul className="vp-brands">
        {items.map((b) => (
          <li key={b.id}>
            <Link to={`/search?brand=${b.slug}`}>
              {b.logoUrl && <img src={b.logoUrl} alt="" width="28" height="28" loading="lazy" />}
              {b.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  useSeo({
    title: undefined,
    description:
      'Shop from many independent sellers on VP Mart: electronics, fashion, groceries, home and more.',
    path: '/',
  });
  const banners = useAsync(() => catalogService.banners(), []);
  const home = useAsync(() => catalogService.home(), []);
  const d = home.data;
  const empty =
    d &&
    ![
      'featuredCategories',
      'trending',
      'bestSellers',
      'newArrivals',
      'todaysDeals',
      'popularPicks',
    ].some((k) => d[k]?.length);

  return (
    <div className="container-xl vp-home">
      {banners.loading ? (
        <Skeleton className="vp-hero-skel" />
      ) : banners.data?.length ? (
        <BannerSlider banners={banners.data} />
      ) : null}
      {home.error && <ErrorState error={home.error} onRetry={home.reload} />}
      {empty && (
        <EmptyState
          title="The marketplace is just getting started"
          action={
            <Link to="/register" className="btn btn-dark">
              Become a seller
            </Link>
          }
        >
          No products are listed yet. Sellers are being onboarded and the catalogue will appear here
          as soon as products go live.
        </EmptyState>
      )}
      {d && <CategoryTiles items={d.featuredCategories} />}
      <ProductRail
        id="deals"
        title="Today’s deals"
        items={d?.todaysDeals}
        loading={home.loading}
        to="/deals"
      />
      <ProductRail
        id="trending"
        title="Trending now"
        items={d?.trending}
        loading={home.loading}
        to="/trending"
      />
      <ProductRail
        id="best"
        title="Best sellers"
        items={d?.bestSellers}
        loading={home.loading}
        to="/best-sellers"
      />
      <ProductRail
        id="new"
        title="New arrivals"
        items={d?.newArrivals}
        loading={home.loading}
        to="/new-arrivals"
      />
      {d && <Brands items={d.popularBrands} />}
      <ProductRail
        id="picks"
        title="Top rated picks"
        items={d?.popularPicks}
        loading={home.loading}
        to="/search?sort=rating"
      />
      <aside className="vp-offers-strip" aria-label="Coupons and offers">
        <div>
          <strong>Coupons & offers</strong>
          <span>See current deals and, when available, coupon codes.</span>
        </div>
        <Link to="/offers" className="btn btn-outline-light btn-sm">
          View offers
        </Link>
      </aside>
    </div>
  );
}
