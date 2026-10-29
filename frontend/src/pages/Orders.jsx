import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Skeleton } from '../components/states.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { cartService } from '../services/cartService.js';
import { formatDateTime } from '../utils/format.js';
import { formatPaise } from '../utils/money.js';

export default function Orders({ tracking = false }) {
  const title = tracking ? 'Track your order' : 'Your orders';
  useSeo({
    title,
    description: 'Your VP Mart orders.',
    path: tracking ? '/track-order' : '/orders',
    noindex: true,
  });
  const orders = useAsync(() => cartService.orders(), []);
  return (
    <section className="container py-4">
      <h1 className="vp-h1-page">{title}</h1>
      {orders.loading && <Skeleton style={{ width: '100%', height: 90 }} />}
      {orders.error && <ErrorState error={orders.error} onRetry={orders.reload} />}
      {orders.data && orders.data.length === 0 && (
        <EmptyState
          title="You haven’t placed any orders yet"
          action={
            <Link to="/" className="btn btn-dark">
              Start shopping
            </Link>
          }
        >
          Orders you place will show up here with their delivery status.
        </EmptyState>
      )}
      {orders.data?.length > 0 && (
        <ul className="vp-order-list">
          {orders.data.map((o) => (
            <li key={o.id}>
              <strong>{o.orderNumber}</strong>
              <span>{formatDateTime(o.createdAt)}</span>
              <span className="badge text-bg-dark">{o.status}</span>
              <span>{formatPaise(o.totalPaise, { fixed: true })}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
