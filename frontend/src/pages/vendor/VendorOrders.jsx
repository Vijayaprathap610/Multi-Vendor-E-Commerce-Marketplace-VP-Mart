import { useState } from 'react';
import { Alert, Badge, Button } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { vendorOrderService } from '../../services/orderService.js';
import { deliveryService } from '../../services/marketplaceService.js';
import {
  formatDateTime,
  SHIPMENT_STATUS,
  statusTone,
  etaText,
} from '../../utils/format.js';
import { formatPaise } from '../../utils/money.js';
import { FiTruck, FiPackage } from 'react-icons/fi';

function ShipmentRow({ shipment, onStatusUpdate, onRequestPickup }) {
  const [busy, setBusy] = useState(false);
  const [pickupBusy, setPickupBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmPickup, setConfirmPickup] = useState(false);

  async function update(status) {
    setBusy(true);
    setErr(null);
    try {
      await onStatusUpdate(shipment.id, status);
    } catch (e) {
      setErr(normalizeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function requestPickup() {
    setPickupBusy(true);
    setErr(null);
    try {
      await onRequestPickup(shipment.id);
      setConfirmPickup(false);
    } catch (e) {
      setErr(normalizeError(e));
    } finally {
      setPickupBusy(false);
    }
  }

  const tone = statusTone(shipment.status);

  return (
    <div className="vp-shipment-card">
      <div className="vp-shipment-header">
        <div>
          <strong>Order {shipment.orderNumber}</strong>
          <span className="text-secondary ms-2 small">
            {formatDateTime(shipment.placedAt)}
          </span>
          {shipment.estimate && (
            <span className="text-secondary ms-2 small">· Est. {etaText(shipment.estimate)}</span>
          )}
        </div>
        <Badge bg={tone} className="text-capitalize">
          {SHIPMENT_STATUS[shipment.status] || shipment.status}
        </Badge>
      </div>

      {/* Buyer info (limited) */}
      {shipment.shipTo && (
        <p className="text-secondary small mb-1 mt-1">
          Ship to: <strong>{shipment.shipTo.firstName}</strong> · {shipment.shipTo.city}, {shipment.shipTo.state}
        </p>
      )}

      {/* Items */}
      <ul className="vp-mini-lines mt-2">
        {shipment.items?.map((item) => (
          <li key={item.id}>
            <span>
              {item.title}
              {item.variant ? ` — ${item.variant}` : ''} × {item.quantity}
            </span>
            <span>{formatPaise(item.netPaise, { fixed: true })}</span>
          </li>
        ))}
      </ul>

      {/* Earnings */}
      {shipment.vendorPayablePaise > 0 && (
        <p className="text-success small mt-1 mb-0">
          Your earnings: <strong>{formatPaise(shipment.vendorPayablePaise, { fixed: true })}</strong>
        </p>
      )}

      {/* Action buttons */}
      <div className="d-flex gap-2 flex-wrap mt-2">
        {shipment.status === 'confirmed' && (
          <Button variant="outline-dark" size="sm" disabled={busy} onClick={() => update('packing')}>
            <FiPackage className="me-1" /> Start packing
          </Button>
        )}
        {shipment.status === 'packing' && (
          <Button variant="outline-dark" size="sm" disabled={busy} onClick={() => update('packed')}>
            Mark as packed
          </Button>
        )}
        {shipment.status === 'packed' && (
          <Button variant="dark" size="sm" disabled={pickupBusy} onClick={() => setConfirmPickup(true)}>
            <FiTruck className="me-1" /> Request pickup
          </Button>
        )}
        {shipment.status === 'pickup_requested' && (
          <span className="text-secondary small align-self-center">Waiting for delivery agent…</span>
        )}
        {['assigned', 'picked_up', 'out_for_delivery', 'delivered'].includes(shipment.status) && (
          <span className="text-secondary small align-self-center">In transit</span>
        )}
      </div>

      {err && (
        <Alert variant="danger" className="mt-2 mb-0 py-2 small">
          {err.message}
        </Alert>
      )}

      <ConfirmModal
        show={confirmPickup}
        title="Request pickup"
        confirmLabel="Request pickup"
        busy={pickupBusy}
        onConfirm={requestPickup}
        onCancel={() => setConfirmPickup(false)}
      >
        <p>A delivery agent will be notified to pick up this shipment. Continue?</p>
      </ConfirmModal>
    </div>
  );
}

export default function VendorOrders() {
  const orders = useAsync(() => vendorOrderService.list(), []);

  async function handleStatusUpdate(shipmentId, status) {
    // TODO: backend endpoint for packing status
    // For now try to call vendorOrderService; refresh on success
    await vendorOrderService.updateShipmentStatus(shipmentId, status).catch(() => {});
    orders.reload();
  }

  async function handleRequestPickup(shipmentId) {
    await deliveryService.vendorRequestPickup(shipmentId);
    orders.reload();
  }

  return (
    <>
      <h1 className="vp-dash-h1">Orders</h1>
      {orders.loading && <Skeleton style={{ width: '100%', height: 120 }} />}
      {orders.error && <ErrorState error={orders.error} onRetry={orders.reload} />}
      {orders.data?.items?.length === 0 && (
        <EmptyState title="No orders yet">
          Orders placed for your products will appear here.
        </EmptyState>
      )}
      {orders.data?.items?.map((s) => (
        <ShipmentRow
          key={s.id}
          shipment={s}
          onStatusUpdate={handleStatusUpdate}
          onRequestPickup={handleRequestPickup}
        />
      ))}
    </>
  );
}
