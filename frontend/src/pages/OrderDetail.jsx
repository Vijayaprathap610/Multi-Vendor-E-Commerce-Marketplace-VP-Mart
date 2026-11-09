import { useState } from 'react';
import { Alert, Badge, Button } from 'react-bootstrap';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ErrorState, Skeleton } from '../components/states.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { normalizeError } from '../services/api.js';
import { orderService } from '../services/orderService.js';
import { invoiceService } from '../services/marketplaceService.js';
import {
  formatDateTime,
  SHIPMENT_STATUS,
  ORDER_STATUS,
  statusTone,
  etaText,
} from '../utils/format.js';
import { formatPaise } from '../utils/money.js';
import { ConfirmModal } from '../components/ui.jsx';
import { FiDownload, FiArrowLeft } from 'react-icons/fi';

function ShipmentCard({ shipment, onCancel }) {
  const [cancelling, setCancelling] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);

  const canCancel = ['confirmed', 'packing', 'packed'].includes(shipment.status);

  async function doCancel() {
    setCancelling(true);
    setErr(null);
    try {
      await onCancel(shipment.id, reason || 'Cancelled by buyer');
      setConfirm(false);
    } catch (e) {
      setErr(normalizeError(e));
    } finally {
      setCancelling(false);
    }
  }

  const tone = statusTone(shipment.status);

  return (
    <div className="vp-shipment-card">
      <div className="vp-shipment-header">
        <div>
          <strong>Shipment from {shipment.vendorName}</strong>
          {shipment.estimate && (
            <span className="text-secondary ms-2 small">Est. {etaText(shipment.estimate)}</span>
          )}
        </div>
        <Badge bg={tone} className="text-capitalize">
          {SHIPMENT_STATUS[shipment.status] || shipment.status}
        </Badge>
      </div>

      {shipment.items?.length > 0 && (
        <ul className="vp-mini-lines mt-2">
          {shipment.items.map((item) => (
            <li key={item.id}>
              <span>
                {item.title}
                {item.variant ? ` — ${item.variant}` : ''} × {item.quantity}
              </span>
              <span>{formatPaise(item.netPaise, { fixed: true })}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex gap-2 flex-wrap mt-2 align-items-center">
        {shipment.trackingNumber && (
          <small className="text-secondary">Tracking: {shipment.trackingNumber}</small>
        )}
        {shipment.paymentMethod === 'cod' && (
          <Badge bg="secondary">COD</Badge>
        )}
        {canCancel && (
          <Button variant="outline-danger" size="sm" onClick={() => setConfirm(true)}>
            Cancel shipment
          </Button>
        )}
      </div>

      {err && <Alert variant="danger" className="mt-2 mb-0 py-2">{err.message}</Alert>}

      <ConfirmModal
        show={confirm}
        title="Cancel shipment"
        confirmLabel="Cancel shipment"
        danger
        busy={cancelling}
        onConfirm={doCancel}
        onCancel={() => setConfirm(false)}
      >
        <p>Are you sure you want to cancel this shipment?</p>
        <label className="form-label small" htmlFor={`reason-${shipment.id}`}>Reason (optional)</label>
        <input
          id={`reason-${shipment.id}`}
          className="form-control form-control-sm"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Changed my mind"
        />
      </ConfirmModal>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const justPlaced = params.get('placed') === '1';

  const order = useAsync(() => orderService.getOrder(id), [id]);
  useSeo({
    title: order.data ? `Order ${order.data.orderNumber}` : 'Order details',
    noindex: true,
  });

  async function handleCancel(shipmentId, reason) {
    await orderService.cancelShipment(id, shipmentId, reason);
    order.reload();
  }

  if (order.loading && !order.data) return <Skeleton style={{ width: '100%', height: 200 }} />;
  if (order.error) return <ErrorState error={order.error} onRetry={order.reload} />;

  const o = order.data;
  if (!o) return null;

  return (
    <section className="container py-4">
      <div className="d-flex align-items-center gap-2 mb-3">
        <Button variant="link" className="p-0 text-dark" onClick={() => navigate(-1)}>
          <FiArrowLeft /> Back
        </Button>
      </div>

      {justPlaced && (
        <Alert variant="success" role="status">
          🎉 Your order has been placed successfully! You will receive a confirmation soon.
        </Alert>
      )}

      <div className="vp-order-detail-header">
        <div>
          <h1 className="vp-h1-page mb-1">Order {o.orderNumber}</h1>
          <p className="text-secondary mb-0">Placed on {formatDateTime(o.placedAt || o.createdAt)}</p>
        </div>
        <div className="d-flex gap-2 align-items-center flex-wrap">
          <Badge bg={statusTone(o.status)} className="text-capitalize fs-6">
            {ORDER_STATUS[o.status] || o.status}
          </Badge>
          <a
            href={invoiceService.downloadUrl(o.id)}
            className="btn btn-outline-dark btn-sm"
            download={`invoice-${o.orderNumber}.pdf`}
          >
            <FiDownload className="me-1" />
            Invoice PDF
          </a>
        </div>
      </div>

      <div className="vp-order-detail-grid mt-4">
        <div>
          {/* Shipments */}
          <section aria-labelledby="od-shipments">
            <h2 id="od-shipments" className="h5 mb-3">Shipments</h2>
            {o.shipments?.length > 0 ? (
              o.shipments.map((s) => (
                <ShipmentCard key={s.id} shipment={s} onCancel={handleCancel} />
              ))
            ) : (
              <p className="text-secondary">No shipment information available yet.</p>
            )}
          </section>

          {/* Delivery address */}
          {o.address && (
            <section className="mt-4" aria-labelledby="od-addr">
              <h2 id="od-addr" className="h5 mb-2">Delivery address</h2>
              <address className="text-secondary" style={{ fontStyle: 'normal' }}>
                <strong>{o.address.name}</strong><br />
                {o.address.line1}{o.address.line2 ? `, ${o.address.line2}` : ''}<br />
                {o.address.city}, {o.address.state} — {o.address.pincode}<br />
                Phone: {o.address.phone}
              </address>
            </section>
          )}
        </div>

        {/* Summary sidebar */}
        <aside aria-label="Order summary">
          <div className="vp-co-card">
            <h2 className="h5">Payment summary</h2>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPaise(o.subtotalPaise ?? o.totalPaise, { fixed: true })}</dd>
              </div>
              {o.discountPaise > 0 && (
                <div>
                  <dt>Discount</dt>
                  <dd>−{formatPaise(o.discountPaise, { fixed: true })}</dd>
                </div>
              )}
              {o.shippingPaise > 0 && (
                <div>
                  <dt>Shipping</dt>
                  <dd>{formatPaise(o.shippingPaise, { fixed: true })}</dd>
                </div>
              )}
              {o.taxPaise > 0 && (
                <div>
                  <dt>GST</dt>
                  <dd>{formatPaise(o.taxPaise, { fixed: true })}</dd>
                </div>
              )}
              <div className="vp-total">
                <dt>Total</dt>
                <dd>{formatPaise(o.totalPaise, { fixed: true })}</dd>
              </div>
            </dl>
            <div className="mt-3 pt-2 border-top">
              <div className="d-flex justify-content-between small text-secondary mb-1">
                <span>Payment Method</span>
                <strong>{o.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)'}</strong>
              </div>
              <div className="d-flex justify-content-between small text-secondary mb-1">
                <span>Payment Status</span>
                <span className={`badge ${o.paymentStatus === 'successful' || o.paymentStatus === 'paid' ? 'bg-success' : 'bg-secondary'}`}>
                  {o.paymentStatus === 'successful' ? 'Paid' : o.paymentStatus || 'Pending'}
                </span>
              </div>
              {o.payment?.providerPaymentId && (
                <div className="d-flex justify-content-between small text-secondary">
                  <span>Transaction ID</span>
                  <code className="text-dark" style={{ fontSize: '11px' }}>{o.payment.providerPaymentId}</code>
                </div>
              )}
            </div>
            {o.couponCode && (
              <p className="mb-0 small text-success mt-1">
                Coupon <strong>{o.couponCode}</strong> applied.
              </p>
            )}
          </div>

          <div className="mt-3 d-flex flex-column gap-2">
            <Link to="/orders" className="btn btn-outline-dark btn-sm w-100">
              All orders
            </Link>
            <Link to="/" className="btn btn-dark btn-sm w-100">
              Continue shopping
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
