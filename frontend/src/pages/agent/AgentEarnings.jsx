import { Stat } from '../../components/ui.jsx';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { deliveryService } from '../../services/marketplaceService.js';
import { formatPaise } from '../../utils/money.js';
import { formatDateTime } from '../../utils/format.js';
import { FiCheckCircle, FiTrendingUp } from 'react-icons/fi';

export default function AgentEarnings() {
  const earnings = useAsync(() => deliveryService.myEarnings(), []);
  const e = earnings.data;

  return (
    <>
      <h1 className="vp-dash-h1">Earnings</h1>
      {earnings.loading && <Skeleton style={{ width: '100%', height: 90 }} />}
      {earnings.error && <ErrorState error={earnings.error} onRetry={earnings.reload} />}
      {e && (
        <>
          <section aria-labelledby="earn-today">
            <h2 id="earn-today" className="h5 mb-3">Today</h2>
            <div className="vp-stats">
              <Stat label="Deliveries" value={e.today?.deliveries ?? 0} />
              <Stat label="Earned" value={formatPaise(e.today?.earningsPaise ?? 0, { fixed: true })} />
            </div>
          </section>

          <section aria-labelledby="earn-week" className="mt-4">
            <h2 id="earn-week" className="h5 mb-3">
              <FiTrendingUp className="me-1" /> This week
            </h2>
            <div className="vp-stats">
              <Stat label="Deliveries" value={e.week?.deliveries ?? 0} />
              <Stat label="Earned" value={formatPaise(e.week?.earningsPaise ?? 0, { fixed: true })} />
            </div>
          </section>

          <section aria-labelledby="earn-total" className="mt-4">
            <h2 id="earn-total" className="h5 mb-3">All time</h2>
            <div className="vp-stats">
              <Stat label="Total deliveries" value={e.total?.deliveries ?? 0} />
              <Stat label="Total earned" value={formatPaise(e.total?.earningsPaise ?? 0, { fixed: true })} />
              <Stat label="Avg per delivery" value={
                e.total?.deliveries > 0
                  ? formatPaise(Math.round((e.total?.earningsPaise ?? 0) / e.total.deliveries), { fixed: true })
                  : '—'
              } />
            </div>
          </section>

          {e.recent?.length > 0 && (
            <section className="mt-4" aria-labelledby="earn-recent">
              <h2 id="earn-recent" className="h5 mb-3">Recent deliveries</h2>
              <ul className="vp-order-list-stack">
                {e.recent.map((d) => (
                  <li key={d.id} className="vp-order-row">
                    <div className="vp-order-row-info">
                      <span>
                        <FiCheckCircle className="me-1 text-success" />
                        {d.destinationAddress?.city || 'Delivery'}
                      </span>
                      <span className="text-secondary small">{formatDateTime(d.deliveredAt)}</span>
                    </div>
                    <span className="text-success fw-semibold">
                      {formatPaise(d.earningPaise ?? 0, { fixed: true })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {e.incentive && (
            <section className="mt-4 vp-incentive-card" aria-labelledby="earn-incentive">
              <h2 id="earn-incentive" className="h5 mb-2">
                <FiTrendingUp className="me-1 text-warning" /> Incentive progress
              </h2>
              <p className="text-secondary small mb-1">
                Complete {e.incentive.target} deliveries this week to earn a bonus of{' '}
                {formatPaise(e.incentive.bonusPaise, { fixed: true })}.
              </p>
              <div className="progress" style={{ height: 10 }} role="progressbar"
                aria-valuenow={e.incentive.progress}
                aria-valuemin={0}
                aria-valuemax={e.incentive.target}>
                <div
                  className="progress-bar bg-warning"
                  style={{ width: `${Math.min(100, Math.round((e.incentive.progress / e.incentive.target) * 100))}%` }}
                />
              </div>
              <small className="text-secondary">
                {e.incentive.progress} / {e.incentive.target} deliveries
              </small>
            </section>
          )}
        </>
      )}
    </>
  );
}
