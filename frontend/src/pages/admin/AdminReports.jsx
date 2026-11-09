import { useState } from 'react';
import { Alert, Badge, Button, Form, Tab, Tabs } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal, Stat, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime } from '../../utils/format.js';
import { formatPaise } from '../../utils/money.js';
import { FiDollarSign, FiBarChart2, FiTrendingUp, FiPlus } from 'react-icons/fi';

function RevenueTab() {
  const report = useAsync(() => adminService.revenueReports(), []);
  const r = report.data;

  return (
    <>
      {report.loading && <Skeleton style={{ width: '100%', height: 180 }} />}
      {report.error && <ErrorState error={report.error} onRetry={report.reload} />}
      {r && (
        <>
          <section aria-labelledby="rev-overview">
            <h2 id="rev-overview" className="h5 mb-3">
              <FiTrendingUp className="me-1" /> Revenue overview
            </h2>
            <div className="vp-stats">
              <Stat label="Total orders" value={r.overview?.totalOrders ?? 0} />
              <Stat
                label="Gross revenue"
                value={formatPaise(r.overview?.grossRevenuePaise ?? 0, { fixed: true })}
                hint="Before commission"
              />
              <Stat
                label="Platform commission"
                value={formatPaise(r.overview?.commissionPaise ?? 0, { fixed: true })}
                hint="Your share"
              />
              <Stat
                label="Vendor payouts"
                value={formatPaise(r.overview?.vendorSharePaise ?? 0, { fixed: true })}
              />
              <Stat
                label="Refunds issued"
                value={formatPaise(r.overview?.refundsPaise ?? 0, { fixed: true })}
              />
              <Stat
                label="Net revenue"
                value={formatPaise(
                  (r.overview?.commissionPaise ?? 0) - (r.overview?.refundsPaise ?? 0),
                  { fixed: true }
                )}
                hint="Commission minus refunds"
              />
            </div>
          </section>

          {r.byCategory?.length > 0 && (
            <section className="mt-4" aria-labelledby="rev-cat">
              <h2 id="rev-cat" className="h5 mb-3">
                <FiBarChart2 className="me-1" /> By category
              </h2>
              <TableWrap>
                <table className="table table-sm vp-admin-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="text-end">Orders</th>
                      <th className="text-end">Revenue</th>
                      <th className="text-end">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byCategory.map((c) => (
                      <tr key={c.category || c._id}>
                        <td>{c.category || c._id || 'Uncategorised'}</td>
                        <td className="text-end">{c.orders ?? 0}</td>
                        <td className="text-end">{formatPaise(c.revenuePaise ?? 0, { fixed: true })}</td>
                        <td className="text-end text-success">{formatPaise(c.commissionPaise ?? 0, { fixed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </section>
          )}

          {r.byVendor?.length > 0 && (
            <section className="mt-4" aria-labelledby="rev-vendor">
              <h2 id="rev-vendor" className="h5 mb-3">
                <FiDollarSign className="me-1" /> By vendor
              </h2>
              <TableWrap>
                <table className="table table-sm vp-admin-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th className="text-end">Orders</th>
                      <th className="text-end">Revenue</th>
                      <th className="text-end">Commission</th>
                      <th className="text-end">Vendor share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byVendor.map((v) => (
                      <tr key={v.vendorId || v._id}>
                        <td>{v.vendorName || v.vendorId?.slice(-8) || v._id}</td>
                        <td className="text-end">{v.orders ?? 0}</td>
                        <td className="text-end">{formatPaise(v.revenuePaise ?? 0, { fixed: true })}</td>
                        <td className="text-end text-success">{formatPaise(v.commissionPaise ?? 0, { fixed: true })}</td>
                        <td className="text-end">{formatPaise(v.vendorSharePaise ?? 0, { fixed: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </section>
          )}
        </>
      )}
    </>
  );
}

function SettlementsTab() {
  const settlements = useAsync(() => adminService.settlements(), []);
  const rows = settlements.data?.items || settlements.data || [];
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ vendorId: '', amountPaise: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await adminService.createSettlement({
        vendorId: form.vendorId.trim(),
        amountPaise: Math.round(Number(form.amountPaise) * 100),
        note: form.note.trim(),
      });
      settlements.reload();
      setCreating(false);
      setForm({ vendorId: '', amountPaise: '', note: '' });
    } catch (ex) {
      setErr(normalizeError(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span className="text-secondary small">Payout settlements to vendors</span>
        <Button variant="dark" size="sm" onClick={() => setCreating(true)}>
          <FiPlus className="me-1" /> New settlement
        </Button>
      </div>

      {settlements.loading && <Skeleton style={{ width: '100%', height: 120 }} />}
      {settlements.error && <ErrorState error={settlements.error} onRetry={settlements.reload} />}
      {!settlements.loading && rows.length === 0 && (
        <EmptyState title="No settlements recorded" />
      )}
      {rows.length > 0 && (
        <TableWrap>
          <table className="table table-sm vp-admin-table">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Date</th>
                <th>Note</th>
                <th>Status</th>
                <th className="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="small">{s.vendorName || s.vendorId?.slice(-8)}</td>
                  <td className="small text-secondary">{formatDateTime(s.createdAt)}</td>
                  <td className="small">{s.note || '—'}</td>
                  <td>
                    <Badge bg={s.status === 'completed' ? 'success' : 'warning'} className="text-capitalize">
                      {s.status}
                    </Badge>
                  </td>
                  <td className="text-end fw-semibold">{formatPaise(s.amountPaise ?? 0, { fixed: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ConfirmModal
        show={creating}
        title="Record settlement"
        confirmLabel={busy ? 'Saving…' : 'Save settlement'}
        busy={busy}
        onConfirm={create}
        onCancel={() => setCreating(false)}
      >
        {err && <Alert variant="danger" className="py-2 small">{err.message}</Alert>}
        <Form.Group className="mb-2">
          <Form.Label>Vendor ID</Form.Label>
          <Form.Control
            required
            value={form.vendorId}
            onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
            placeholder="Vendor user ID"
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label>Amount (₹)</Form.Label>
          <Form.Control
            required
            type="number"
            min={1}
            value={form.amountPaise}
            onChange={(e) => setForm((f) => ({ ...f, amountPaise: e.target.value }))}
            placeholder="Amount in rupees"
          />
        </Form.Group>
        <Form.Group>
          <Form.Label>Note</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="e.g. NEFT transfer — March 2025"
          />
        </Form.Group>
      </ConfirmModal>
    </>
  );
}

export default function AdminReports() {
  const [tab, setTab] = useState('revenue');
  return (
    <>
      <h1 className="vp-dash-h1">Reports &amp; Settlements</h1>
      <Tabs activeKey={tab} onSelect={setTab} className="mb-3">
        <Tab eventKey="revenue" title="Revenue">
          <RevenueTab />
        </Tab>
        <Tab eventKey="settlements" title="Settlements">
          <SettlementsTab />
        </Tab>
      </Tabs>
    </>
  );
}
