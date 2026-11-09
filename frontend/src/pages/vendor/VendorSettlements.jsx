import { Badge } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { Stat, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { reportsService } from '../../services/marketplaceService.js';
import { formatDateTime } from '../../utils/format.js';
import { formatPaise } from '../../utils/money.js';
import { FiCheckCircle, FiClock } from 'react-icons/fi';

export default function VendorSettlements() {
  const settlements = useAsync(() => reportsService.getVendorSettlements(), []);
  const items = settlements.data?.items || settlements.data || [];

  const totalSettledPaise = items
    .filter((s) => s.status === 'completed')
    .reduce((acc, s) => acc + (s.amountPaise ?? 0), 0);

  return (
    <>
      <h1 className="vp-dash-h1">Settlements &amp; Payouts</h1>
      {settlements.loading && <Skeleton style={{ width: '100%', height: 120 }} />}
      {settlements.error && <ErrorState error={settlements.error} onRetry={settlements.reload} />}

      {!settlements.loading && (
        <div className="vp-stats mb-4">
          <Stat
            label="Total Payouts"
            value={formatPaise(totalSettledPaise, { fixed: true })}
            hint="Completed payouts to your bank"
          />
          <Stat label="Settlement Records" value={items.length} />
        </div>
      )}

      {!settlements.loading && items.length === 0 && (
        <EmptyState title="No settlements yet">
          Payouts for your completed orders will be processed by marketplace administration and will appear here.
        </EmptyState>
      )}

      {items.length > 0 && (
        <TableWrap>
          <table className="table table-hover table-sm vp-table">
            <thead>
              <tr>
                <th>Settlement #</th>
                <th>Date</th>
                <th>Bank Account</th>
                <th>Reference</th>
                <th>Status</th>
                <th className="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="small font-monospace fw-semibold">{s.settlementNumber || s.id?.slice(-8)}</td>
                  <td className="small text-secondary">{formatDateTime(s.processedAt || s.createdAt)}</td>
                  <td className="small">{s.bankAccountMasked || '—'}</td>
                  <td className="small text-secondary">{s.payoutReference || '—'}</td>
                  <td>
                    <Badge bg={s.status === 'completed' ? 'success' : 'warning'} className="text-capitalize">
                      {s.status === 'completed' ? <FiCheckCircle className="me-1" /> : <FiClock className="me-1" />}
                      {s.status}
                    </Badge>
                  </td>
                  <td className="text-end fw-semibold text-success">
                    {formatPaise(s.amountPaise ?? 0, { fixed: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
