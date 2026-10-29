import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard.jsx';
import { EmptyState, ErrorState, GridSkeleton } from '../components/states.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { catalogService } from '../services/catalogService.js';

export default function Offers() {
  useSeo({
    title: 'Coupons & offers',
    description: 'Current deals and discounts on VP Mart.',
    path: '/offers',
  });
  const deals = useAsync(
    () => catalogService.search({ collection: 'deals', sort: 'relevance', page: 1, limit: 12 }),
    [],
  );
  return (
    <section className="container-xl py-4">
      <h1 className="vp-h1-page">Coupons & offers</h1>
      <p className="text-secondary">
        Discounts set by sellers are shown on every product. Coupon codes issued by VP Mart will be
        listed here when they are available.
      </p>
      <h2 className="h5 mt-4">Discounted right now</h2>
      {deals.loading && <GridSkeleton n={4} />}
      {deals.error && <ErrorState error={deals.error} onRetry={deals.reload} />}
      {deals.data?.items.length === 0 && (
        <EmptyState
          title="No discounted products at the moment"
          action={
            <Link to="/" className="btn btn-dark">
              Keep browsing
            </Link>
          }
        >
          Check back soon.
        </EmptyState>
      )}
      {deals.data?.items.length > 0 && (
        <>
          <div className="vp-grid">
            {deals.data.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <div className="mt-3">
            <Link to="/deals">See all deals</Link>
          </div>
        </>
      )}
    </section>
  );
}
