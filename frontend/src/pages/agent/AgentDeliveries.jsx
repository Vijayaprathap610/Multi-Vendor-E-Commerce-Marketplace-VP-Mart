import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal, Tab, Tabs } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { deliveryService } from '../../services/marketplaceService.js';
import { SHIPMENT_STATUS, statusTone, formatDateTime } from '../../utils/format.js';
import { formatPaise } from '../../utils/money.js';
import { FiTruck, FiCheck, FiAlertTriangle, FiRotateCcw, FiMapPin, FiClock } from 'react-icons/fi';

const ACTIVE_STATUSES = ['assigned', 'picked_up', 'out_for_delivery', 'failed_delivery'];
const DONE_STATUSES = ['delivered', 'returned', 'returning'];

function OtpModal({ show, shipmentId, onClose, onSuccess }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function verify(e) {
    e.preventDefault();
    if (!otp.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await deliveryService.verifyOtp(shipmentId, otp.trim());
      setOtp('');
      onSuccess();
      onClose();
    } catch (ex) {
      setErr(normalizeError(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">Verify delivery OTP</Modal.Title>
      </Modal.Header>
      <Form onSubmit={verify}>
        <Modal.Body>
          <p className="text-secondary small">
            Ask the buyer for the 6-digit OTP sent to them. Enter it here to confirm delivery.
          </p>
          <Form.Control
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter OTP"
            autoFocus
            className="text-center fs-4 letter-spacing-wide"
          />
          {err && <Alert variant="danger" className="mt-2 mb-0 py-2 small">{err.message}</Alert>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="dark" disabled={busy || otp.length < 4}>
            {busy ? 'Verifying…' : 'Confirm delivery'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

function FailedModal({ show, shipmentId, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function report() {
    setBusy(true);
    setErr(null);
    try {
      await deliveryService.reportFailed(shipmentId, { reason: reason || 'Delivery attempt failed' });
      onSuccess();
      onClose();
    } catch (ex) {
      setErr(normalizeError(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">Report failed delivery</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Label>Reason</Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer not available, address not found…"
        />
        {err && <Alert variant="danger" className="mt-2 mb-0 py-2 small">{err.message}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={report} disabled={busy}>
          {busy ? 'Reporting…' : 'Report failed'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function DeliveryCard({ shipment, onReload }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showOtp, setShowOtp] = useState(false);
  const [showFailed, setShowFailed] = useState(false);

  async function doPickup() {
    setBusy(true);
    setErr(null);
    try {
      await deliveryService.pickupPackage(shipment.id);
      onReload();
    } catch (ex) {
      setErr(normalizeError(ex));
    } finally {
      setBusy(false);
    }
  }

  async function doReturn() {
    setBusy(true);
    setErr(null);
    try {
      await deliveryService.returnToVendor(shipment.id, 'Failed delivery — returning to vendor');
      onReload();
    } catch (ex) {
      setErr(normalizeError(ex));
    } finally {
      setBusy(false);
    }
  }

  const tone = statusTone(shipment.status);

  return (
    <div className="vp-shipment-card">
      <div className="vp-shipment-header">
        <div>
          <strong>#{shipment.id?.slice(-6).toUpperCase()}</strong>
          <span className="text-secondary ms-2 small">{formatDateTime(shipment.assignedAt)}</span>
        </div>
        <Badge bg={tone} className="text-capitalize">
          {SHIPMENT_STATUS[shipment.status] || shipment.status}
        </Badge>
      </div>

      <div className="mt-2 vp-addr-mini-grid">
        <div>
          <small className="text-secondary d-block">Pickup</small>
          <span>
            <FiMapPin className="me-1 text-danger" size={12} />
            {shipment.pickupAddress?.city}, {shipment.pickupAddress?.pincode}
          </span>
        </div>
        <div>
          <small className="text-secondary d-block">Deliver to</small>
          <span>
            <FiMapPin className="me-1 text-success" size={12} />
            {shipment.destinationAddress?.city}, {shipment.destinationAddress?.pincode}
          </span>
        </div>
        {shipment.codAmountDuePaise > 0 && (
          <div>
            <small className="text-secondary d-block">COD</small>
            <span className="text-warning fw-semibold">
              {formatPaise(shipment.codAmountDuePaise, { fixed: true })}
            </span>
          </div>
        )}
      </div>

      <div className="d-flex gap-2 flex-wrap mt-2">
        {shipment.status === 'assigned' && (
          <Button variant="dark" size="sm" disabled={busy} onClick={doPickup}>
            <FiTruck className="me-1" /> Confirm pickup
          </Button>
        )}
        {(shipment.status === 'picked_up' || shipment.status === 'out_for_delivery') && (
          <>
            <Button variant="success" size="sm" onClick={() => setShowOtp(true)}>
              <FiCheck className="me-1" /> Verify OTP
            </Button>
            <Button variant="outline-danger" size="sm" onClick={() => setShowFailed(true)}>
              <FiAlertTriangle className="me-1" /> Failed delivery
            </Button>
          </>
        )}
        {shipment.status === 'failed_delivery' && (
          <>
            <Button variant="outline-dark" size="sm" disabled={busy} onClick={doReturn}>
              <FiRotateCcw className="me-1" /> Return to vendor
            </Button>
            <Button variant="outline-dark" size="sm" onClick={() => setShowOtp(true)}>
              Retry delivery
            </Button>
          </>
        )}
      </div>

      {err && (
        <Alert variant="danger" className="mt-2 mb-0 py-2 small">{err.message}</Alert>
      )}

      <OtpModal
        show={showOtp}
        shipmentId={shipment.id}
        onClose={() => setShowOtp(false)}
        onSuccess={onReload}
      />
      <FailedModal
        show={showFailed}
        shipmentId={shipment.id}
        onClose={() => setShowFailed(false)}
        onSuccess={onReload}
      />
    </div>
  );
}

export default function AgentDeliveries() {
  const { user } = useAuth();
  const isPending = user?.status === 'pending_approval';
  const [tab, setTab] = useState('active');
  const deliveries = useAsync(
    () => deliveryService.myDeliveries(tab === 'done' ? 'delivered,returned,returning' : 'assigned,picked_up,out_for_delivery,failed_delivery'),
    [tab],
  );

  const items = deliveries.data?.items || deliveries.data?.shipments || (Array.isArray(deliveries.data) ? deliveries.data : []);

  return (
    <>
      <h1 className="vp-dash-h1">My Deliveries</h1>

      {isPending && (
        <Alert variant="warning" className="d-flex align-items-center gap-2 mb-4">
          <FiClock size={20} className="flex-shrink-0" />
          <div>
            <strong>Account pending approval.</strong> Your delivery agent account is under review. Deliveries cannot be assigned or completed until an administrator approves your account.
          </div>
        </Alert>
      )}

      <Tabs activeKey={tab} onSelect={setTab} className="mb-3">
        <Tab eventKey="active" title="Active" />
        <Tab eventKey="done" title="Completed" />
      </Tabs>

      {deliveries.loading && <Skeleton style={{ width: '100%', height: 120 }} />}
      {deliveries.error && !isPending && <ErrorState error={deliveries.error} onRetry={deliveries.reload} />}
      {!deliveries.loading && items.length === 0 && (
        <EmptyState title={tab === 'active' ? 'No active deliveries' : 'No completed deliveries'}>
          {tab === 'active'
            ? 'Accept a pickup from the Available Pickups page.'
            : 'Completed deliveries will appear here.'}
        </EmptyState>
      )}
      {items.map((s) => (
        <DeliveryCard key={s.id} shipment={s} onReload={deliveries.reload} />
      ))}
    </>
  );
}
