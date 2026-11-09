import { useState } from 'react';
import { Alert, Badge, Button } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { deliveryService } from '../../services/marketplaceService.js';
import { formatPaise } from '../../utils/money.js';
import { FiPackage, FiMapPin, FiClock } from 'react-icons/fi';

function AvailableCard({ shipment, onAccept }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirm, setConfirm] = useState(false);

  async function accept() {
    setBusy(true);
    setErr(null);
    try {
      await onAccept(shipment.id);
      setConfirm(false);
    } catch (e) {
      setErr(normalizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vp-shipment-card">
      <div className="vp-shipment-header">
        <div>
          <FiPackage className="me-1 text-secondary" />
          <strong>Shipment #{shipment.id?.slice(-6).toUpperCase()}</strong>
        </div>
        <Badge bg="warning" text="dark">Pickup needed</Badge>
      </div>

      <div className="mt-2 vp-addr-mini-grid">
        <div>
          <small className="text-secondary d-block">Pickup from</small>
          <span>
            <FiMapPin className="me-1 text-danger" size={12} />
            {shipment.pickupAddress?.city || 'Vendor location'}, {shipment.pickupAddress?.pincode}
          </span>
        </div>
        <div>
          <small className="text-secondary d-block">Deliver to</small>
          <span>
            <FiMapPin className="me-1 text-success" size={12} />
            {shipment.destinationAddress?.city || 'Buyer location'}, {shipment.destinationAddress?.pincode}
          </span>
        </div>
        {shipment.codAmountDuePaise > 0 && (
          <div>
            <small className="text-secondary d-block">COD amount</small>
            <span className="text-warning fw-semibold">
              {formatPaise(shipment.codAmountDuePaise, { fixed: true })}
            </span>
          </div>
        )}
      </div>

      <div className="mt-2">
        <Button variant="dark" size="sm" onClick={() => setConfirm(true)}>
          Accept pickup
        </Button>
      </div>

      {err && (
        <Alert variant="danger" className="mt-2 mb-0 py-2 small">{err.message}</Alert>
      )}

      <ConfirmModal
        show={confirm}
        title="Accept this pickup?"
        confirmLabel="Accept"
        busy={busy}
        onConfirm={accept}
        onCancel={() => setConfirm(false)}
      >
        <p>You will be responsible for picking up and delivering this shipment.</p>
        <p className="mb-0 text-secondary small">
          Pickup: {shipment.pickupAddress?.city} → Deliver to: {shipment.destinationAddress?.city}
          {shipment.codAmountDuePaise > 0 && (
            <> · COD: {formatPaise(shipment.codAmountDuePaise, { fixed: true })}</>
          )}
        </p>
      </ConfirmModal>
    </div>
  );
}

export default function AgentAvailable() {
  const { user } = useAuth();
  const isPending = user?.status === 'pending_approval';
  const available = useAsync(() => (!isPending ? deliveryService.listAvailable() : Promise.resolve({ items: [] })), [isPending]);

  async function handleAccept(shipmentId) {
    await deliveryService.acceptPickup(shipmentId);
    available.reload();
  }

  const items = available.data?.items || available.data?.shipments || (Array.isArray(available.data) ? available.data : []);

  return (
    <>
      <h1 className="vp-dash-h1">Available Pickups</h1>
      {isPending && (
        <Alert variant="warning" className="d-flex align-items-center gap-2 mb-4">
          <FiClock size={20} className="flex-shrink-0" />
          <div>
            <strong>Account pending approval.</strong> Pickups cannot be accepted until an administrator approves your agent account.
          </div>
        </Alert>
      )}
      {available.loading && <Skeleton style={{ width: '100%', height: 120 }} />}
      {available.error && !isPending && <ErrorState error={available.error} onRetry={available.reload} />}
      {!isPending && !available.loading && items.length === 0 && (
        <EmptyState title="No pickups available right now">
          Check back soon — new shipments will appear here when vendors request pickup.
        </EmptyState>
      )}
      {!isPending && items.map((s) => (
        <AvailableCard key={s.id} shipment={s} onAccept={handleAccept} />
      ))}
    </>
  );
}
