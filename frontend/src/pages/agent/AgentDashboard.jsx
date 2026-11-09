import { Alert } from 'react-bootstrap';
import { Stat } from '../../components/ui.jsx';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { deliveryService } from '../../services/marketplaceService.js';
import { formatPaise } from '../../utils/money.js';
import { formatDateTime } from '../../utils/format.js';
import { FiPackage, FiTruck, FiCheckCircle, FiDollarSign, FiClock } from 'react-icons/fi';

export default function AgentDashboard() {
  const { user } = useAuth();
  const isPending = user?.status === 'pending_approval';
  const earnings = useAsync(() => deliveryService.myEarnings(), []);
  const e = earnings.data;

  return (
    <>
      <h1 className="vp-dash-h1">Dashboard</h1>

      {/* Pending approval notice */}
      {isPending && (
        <Alert variant="warning" className="d-flex align-items-center gap-2 mb-4">
          <FiClock size={20} className="flex-shrink-0" />
          <div>
            <strong>Account pending approval.</strong> Your delivery agent account is under review.
            You will be able to accept pickups once a Platform Admin activates your account.
          </div>
        </Alert>
      )}

      {earnings.loading && <Skeleton style={{ width: '100%', height: 90 }} />}
      {earnings.error && !isPending && <ErrorState error={earnings.error} onRetry={earnings.reload} />}
      {e && (
        <>
          <div className="vp-stats">
            <Stat
              label="Today's deliveries"
              value={e.today?.deliveries ?? 0}
              hint="Completed today"
            />
            <Stat
              label="Today's earnings"
              value={formatPaise(e.today?.earningsPaise ?? 0, { fixed: true })}
            />
            <Stat
              label="Week's earnings"
              value={formatPaise(e.week?.earningsPaise ?? 0, { fixed: true })}
            />
            <Stat
              label="Total deliveries"
              value={e.total?.deliveries ?? 0}
              hint="All time"
            />
            <Stat
              label="Total earned"
              value={formatPaise(e.total?.earningsPaise ?? 0, { fixed: true })}
              hint="All time"
            />
          </div>

          {/* Quick links */}
          <div className="vp-dash-quick-links mt-4">
            {!isPending && (
              <a href="/agent/available" className="vp-quick-link">
                <FiPackage size={22} />
                <span>Available pickups</span>
              </a>
            )}
            <a href="/agent/deliveries" className="vp-quick-link">
              <FiTruck size={22} />
              <span>My deliveries</span>
            </a>
            <a href="/agent/earnings" className="vp-quick-link">
              <FiDollarSign size={22} />
              <span>Earnings</span>
            </a>
          </div>

          {/* Recent deliveries */}
          {e.recent?.length > 0 && (
            <section className="mt-4" aria-labelledby="da-recent">
              <h2 id="da-recent" className="h5">Recent deliveries</h2>
              <ul className="vp-order-list-stack">
                {e.recent.map((d) => (
                  <li key={d.id} className="vp-order-row">
                    <div className="vp-order-row-info">
                      <span>{d.destinationAddress?.city || 'Unknown city'}</span>
                      <span className="text-secondary small">{formatDateTime(d.deliveredAt)}</span>
                    </div>
                    <div className="text-success">
                      <FiCheckCircle className="me-1" />
                      {formatPaise(d.earningPaise ?? 0, { fixed: true })}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
