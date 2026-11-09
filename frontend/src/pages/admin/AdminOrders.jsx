import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Tab, Tabs } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal, StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime, ORDER_STATUS, PAYMENT_STATUS, statusTone } from '../../utils/format.js';
import { formatPaise } from '../../utils/money.js';
import { FiEye, FiRefreshCw } from 'react-icons/fi';

function OrderDetailModal({ orderId, onClose }) {
  const order = useAsync(() => (orderId ? adminService.order(orderId) : Promise.resolve(null)), [orderId]);
  const o = order.data;

  return (
    <Modal show={!!orderId} onHide={onClose} size="lg" centered scrollable className="vp-modal-scrollable">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {o ? `Order ${o.orderNumber}` : 'Order details'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {order.loading && <Skeleton style={{ width: '100%', height: 150 }} />}
        {order.error && <ErrorState error={order.error} />}
        {o && (
          <>
            <div className="row mb-3">
              <div className="col-sm-6">
                <small className="text-secondary d-block">Status</small>
                <Badge bg={statusTone(o.status)}>{ORDER_STATUS[o.status] || o.status}</Badge>
              </div>
              <div className="col-sm-6">
                <small className="text-secondary d-block">Placed</small>
                <span>{formatDateTime(o.placedAt || o.createdAt)}</span>
              </div>
              <div className="col-sm-6 mt-2">
                <small className="text-secondary d-block">Payment</small>
                <span>{o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online'}</span>
              </div>
              <div className="col-sm-6 mt-2">
                <small className="text-secondary d-block">Total</small>
                <strong>{formatPaise(o.totalPaise, { fixed: true })}</strong>
              </div>
            </div>
            {o.shipments?.length > 0 && (
              <>
                <h3 className="h6">Shipments</h3>
                <TableWrap>
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Status</th>
                        <th>Items</th>
                        <th className="text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.shipments.map((s) => (
                        <tr key={s.id}>
                          <td>{s.vendorName || s.vendorId?.slice(-6)}</td>
                          <td>
                            <Badge bg={statusTone(s.status)} className="text-capitalize">
                              {s.status}
                            </Badge>
                          </td>
                          <td>{s.itemCount || '—'}</td>
                          <td className="text-end">{formatPaise(s.totalPaise ?? 0, { fixed: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

function OrdersTab() {
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState(null);
  const orders = useAsync(() => adminService.orders({ page, limit: 20 }), [page]);
  const rows = orders.data?.orders || orders.data?.items || [];

  return (
    <>
      {orders.loading && <Skeleton style={{ width: '100%', height: 180 }} />}
      {orders.error && <ErrorState error={orders.error} onRetry={orders.reload} />}
      {!orders.loading && rows.length === 0 && (
        <EmptyState title="No orders yet" />
      )}
      {rows.length > 0 && (
        <TableWrap>
          <table className="table table-hover table-sm vp-admin-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Placed</th>
                <th>Buyer</th>
                <th>Payment</th>
                <th>Status</th>
                <th className="text-end">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className="text-monospace small">{o.orderNumber}</td>
                  <td className="small text-secondary">{formatDateTime(o.placedAt || o.createdAt)}</td>
                  <td className="small">{o.buyerName || o.buyerId?.slice(-6)}</td>
                  <td className="small">
                    <Badge bg={o.paymentMethod === 'cod' ? 'secondary' : 'primary'}>
                      {o.paymentMethod === 'cod' ? 'COD' : 'Online'}
                    </Badge>
                  </td>
                  <td>
                    <Badge bg={statusTone(o.status)} className="text-capitalize">
                      {ORDER_STATUS[o.status] || o.status}
                    </Badge>
                  </td>
                  <td className="text-end fw-semibold">{formatPaise(o.totalPaise, { fixed: true })}</td>
                  <td>
                    <Button variant="link" size="sm" className="p-0 text-dark" onClick={() => setViewId(o.id)}>
                      <FiEye />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {orders.data?.pages > 1 && (
        <div className="d-flex justify-content-between mt-2">
          <Button variant="outline-secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="small text-secondary">Page {orders.data.page} of {orders.data.pages}</span>
          <Button variant="outline-secondary" size="sm" disabled={page >= orders.data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
      <OrderDetailModal orderId={viewId} onClose={() => setViewId(null)} />
    </>
  );
}

function PaymentsTab() {
  const [page, setPage] = useState(1);
  const payments = useAsync(() => adminService.payments({ page, limit: 20 }), [page]);
  const rows = payments.data?.payments || payments.data?.items || [];

  return (
    <>
      {payments.loading && <Skeleton style={{ width: '100%', height: 180 }} />}
      {payments.error && <ErrorState error={payments.error} onRetry={payments.reload} />}
      {rows.length === 0 && !payments.loading && <EmptyState title="No payments yet" />}
      {rows.length > 0 && (
        <TableWrap>
          <table className="table table-hover table-sm vp-admin-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Date</th>
                <th>Method</th>
                <th>Status</th>
                <th className="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="small text-monospace">{p.orderNumber || p.orderId?.slice(-8)}</td>
                  <td className="small text-secondary">{formatDateTime(p.createdAt)}</td>
                  <td className="small">{p.method || p.paymentMethod || '—'}</td>
                  <td>
                    <Badge bg={statusTone(p.status)} className="text-capitalize">
                      {PAYMENT_STATUS[p.status] || p.status}
                    </Badge>
                  </td>
                  <td className="text-end fw-semibold">{formatPaise(p.amountPaise ?? p.totalPaise ?? 0, { fixed: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}

function RefundsTab() {
  const refunds = useAsync(() => adminService.refunds(), []);
  const rows = refunds.data || [];
  const [retryId, setRetryId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function doRetry() {
    setBusy(true);
    setErr(null);
    try {
      await adminService.retryRefund(retryId);
      refunds.reload();
      setRetryId(null);
    } catch (e) {
      setErr(normalizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {refunds.loading && <Skeleton style={{ width: '100%', height: 120 }} />}
      {refunds.error && <ErrorState error={refunds.error} onRetry={refunds.reload} />}
      {rows.length === 0 && !refunds.loading && <EmptyState title="No pending refunds" />}
      {err && <Alert variant="danger">{err.message}</Alert>}
      {rows.length > 0 && (
        <TableWrap>
          <table className="table table-hover table-sm vp-admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Created</th>
                <th>Status</th>
                <th className="text-end">Amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small text-monospace">{r.orderNumber || r.orderId?.slice(-8)}</td>
                  <td className="small text-secondary">{formatDateTime(r.createdAt)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="text-end fw-semibold">{formatPaise(r.amountPaise ?? 0, { fixed: true })}</td>
                  <td>
                    {r.status === 'pending' && (
                      <Button variant="link" size="sm" className="p-0 text-dark" onClick={() => setRetryId(r.id)}>
                        <FiRefreshCw size={14} />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <ConfirmModal
        show={!!retryId}
        title="Retry refund"
        confirmLabel="Retry"
        busy={busy}
        onConfirm={doRetry}
        onCancel={() => setRetryId(null)}
      >
        Retry the refund for this order?
      </ConfirmModal>
    </>
  );
}

export default function AdminOrders() {
  const [tab, setTab] = useState('orders');
  return (
    <>
      <h1 className="vp-dash-h1">Orders &amp; Payments</h1>
      <Tabs activeKey={tab} onSelect={setTab} className="mb-3">
        <Tab eventKey="orders" title="Orders">
          <OrdersTab />
        </Tab>
        <Tab eventKey="payments" title="Payments">
          <PaymentsTab />
        </Tab>
        <Tab eventKey="refunds" title="Refunds">
          <RefundsTab />
        </Tab>
      </Tabs>
    </>
  );
}
