import { Link } from 'react-router-dom';
import { Badge } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../components/states.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { orderService } from '../services/orderService.js';
import { invoiceService } from '../services/marketplaceService.js';
import { formatDateTime, ORDER_STATUS, statusTone } from '../utils/format.js';
import { formatPaise } from '../utils/money.js';
import { FiDownload, FiEye } from 'react-icons/fi';

export default function Orders({ tracking = false }) {
  const title = tracking ? 'Track your order' : 'Your orders';
  useSeo({
    title,
    description: 'Your VP Mart orders.',
    path: tracking ? '/track-order' : '/orders',
    noindex: true,
  });
  const orders = useAsync(() => orderService.list(), []);

  return (
    <section className="container py-4">
      <h1 className="vp-h1-page">{title}</h1>
      {orders.loading && <Skeleton style={{ width: '100%', height: 90 }} />}
      {orders.error && <ErrorState error={orders.error} onRetry={orders.reload} />}
      {orders.data?.items?.length === 0 && (
        <EmptyState
          title="You haven't placed any orders yet"
          action={
            <Link to="/" className="btn btn-dark">
              Start shopping
            </Link>
          }
        >
          Orders you place will show up here with their delivery status.
        </EmptyState>
      )}
      {orders.data?.items?.length > 0 && (
        <div className="vp-order-list-stack">
          {orders.data.items.map((o) => (
            <div key={o.id} className="vp-order-row">
              <div className="vp-order-row-info">
                <div>
                  <strong>{o.orderNumber}</strong>
                  <span className="text-secondary ms-2 small">{formatDateTime(o.placedAt || o.createdAt)}</span>
                </div>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <Badge bg={statusTone(o.status)} className="text-capitalize">
                    {ORDER_STATUS[o.status] || o.status}
                  </Badge>
                  <span className="fw-semibold">{formatPaise(o.totalPaise, { fixed: true })}</span>
                </div>
              </div>
              <div className="vp-order-row-actions">
                <Link to={`/orders/${o.id}`} className="btn btn-sm btn-outline-dark">
                  <FiEye className="me-1" /> View details
                </Link>
                <a
                  href={invoiceService.downloadUrl(o.id)}
                  className="btn btn-sm btn-outline-secondary"
                  download
                >
                  <FiDownload className="me-1" /> Invoice
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
