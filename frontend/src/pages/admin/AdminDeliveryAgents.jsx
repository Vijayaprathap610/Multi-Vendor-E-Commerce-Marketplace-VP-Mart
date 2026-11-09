import { useState, useCallback } from 'react';
import {
  Alert,
  Badge,
  Button,
  Col,
  Form,
  Modal,
  Row,
  Tab,
  Tabs,
} from 'react-bootstrap';
import Pagination from '../../components/Pagination.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime, formatINR } from '../../utils/format.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const VEHICLE_TYPES = ['bike', 'bicycle', 'car', 'van', 'truck', 'walk'];
const ACCOUNT_STATUSES = ['active', 'pending_approval', 'suspended', 'deactivated'];
const DELIVERY_STATUSES = [
  'confirmed',
  'packing',
  'packed',
  'pickup_requested',
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivered',
  'failed_delivery',
  'returned',
  'cancelled',
];

function availBadge(avail) {
  const map = {
    available: 'success',
    busy: 'warning',
    offline: 'secondary',
  };
  return (
    <Badge bg={map[avail] || 'secondary'} className="text-capitalize">
      {avail}
    </Badge>
  );
}

function statusBadge(status) {
  const map = {
    confirmed: 'info',
    packing: 'warning',
    packed: 'warning',
    pickup_requested: 'primary',
    assigned: 'primary',
    picked_up: 'info',
    out_for_delivery: 'info',
    delivered: 'success',
    failed_delivery: 'danger',
    returned: 'secondary',
    cancelled: 'dark',
  };
  return (
    <Badge bg={map[status] || 'secondary'} style={{ fontSize: '0.75rem' }}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

function agentInitials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function InfoRow({ label, value }) {
  return (
    <Row className="mb-2">
      <Col xs={4} className="text-muted fw-semibold" style={{ fontSize: '0.85rem' }}>
        {label}
      </Col>
      <Col xs={8} style={{ fontSize: '0.9rem' }}>
        {value ?? '–'}
      </Col>
    </Row>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Form Modal (Create / Edit)
// ─────────────────────────────────────────────────────────────────────────────
function AgentFormModal({ agent, onClose, onSaved }) {
  const isEdit = Boolean(agent);
  const [form, setForm] = useState({
    name: agent?.name || '',
    email: agent?.email || '',
    phone: agent?.phone || '',
    password: '',
    status: agent?.status || 'active',
    vehicleType: agent?.vehicleType || 'bike',
    vehicleNumber: agent?.vehicleNumber || '',
    drivingLicense: agent?.drivingLicense || '',
    servicePincodes: (agent?.servicePincodes || []).join(', '),
    isAvailable: agent?.isAvailable !== false,
  });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setCheck = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        status: form.status,
        vehicleType: form.vehicleType,
        vehicleNumber: form.vehicleNumber.trim(),
        drivingLicense: form.drivingLicense.trim(),
        servicePincodes: form.servicePincodes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        isAvailable: form.isAvailable,
      };
      if (!isEdit) {
        payload.email = form.email.trim();
        payload.password = form.password;
      } else if (form.password.trim()) {
        payload.password = form.password;
      }
      if (isEdit) {
        await adminService.updateDeliveryAgent(agent.id, payload);
      } else {
        await adminService.createDeliveryAgent(payload);
      }
      onSaved();
    } catch (e) {
      setErr(normalizeError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      show
      onHide={onClose}
      size="lg"
      scrollable
      centered
      className="vp-modal-scrollable"
      aria-labelledby="agent-form-title"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5" id="agent-form-title">
          {isEdit ? `Edit: ${agent.name}` : 'Add New Delivery Agent'}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit} className="vp-modal-form">
        <Modal.Body>
          {err && (
            <Alert variant="danger" role="alert">
              {err}
            </Alert>
          )}

          <h6 className="text-muted mb-3 border-bottom pb-2">Personal Details</h6>
          <Row className="g-3 mb-3">
            <Col md={6}>
              <Form.Label htmlFor="ag-name">
                Full Name <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                id="ag-name"
                value={form.name}
                onChange={set('name')}
                required
                placeholder="e.g. Ravi Kumar"
              />
            </Col>
            <Col md={6}>
              <Form.Label htmlFor="ag-email">
                Email Address {!isEdit && <span className="text-danger">*</span>}
              </Form.Label>
              <Form.Control
                id="ag-email"
                type="email"
                value={form.email}
                onChange={set('email')}
                required={!isEdit}
                disabled={isEdit}
                placeholder="agent@example.com"
              />
            </Col>
            <Col md={6}>
              <Form.Label htmlFor="ag-phone">Contact Number</Form.Label>
              <Form.Control
                id="ag-phone"
                value={form.phone}
                onChange={set('phone')}
                placeholder="e.g. +91 98765 43210"
              />
            </Col>
            <Col md={6}>
              <Form.Label htmlFor="ag-password">
                Password {!isEdit && <span className="text-danger">*</span>}
              </Form.Label>
              <Form.Control
                id="ag-password"
                type="password"
                value={form.password}
                onChange={set('password')}
                required={!isEdit}
                placeholder={isEdit ? 'Leave blank to keep current' : 'Min 10 chars, letters & numbers'}
                autoComplete="new-password"
              />
              <Form.Text className="text-muted">Min 10 characters, must include letters and numbers.</Form.Text>
            </Col>
          </Row>

          <h6 className="text-muted mb-3 border-bottom pb-2">Account Status</h6>
          <Row className="g-3 mb-3">
            <Col md={6}>
              <Form.Label htmlFor="ag-status">Account Status</Form.Label>
              <Form.Select id="ag-status" value={form.status} onChange={set('status')}>
                {ACCOUNT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={6} className="d-flex align-items-end">
              <Form.Check
                type="switch"
                id="ag-available"
                label="Mark as Available for Deliveries"
                checked={form.isAvailable}
                onChange={setCheck('isAvailable')}
                className="mb-2"
              />
            </Col>
          </Row>

          <h6 className="text-muted mb-3 border-bottom pb-2">Vehicle & Delivery Info</h6>
          <Row className="g-3 mb-3">
            <Col md={6}>
              <Form.Label htmlFor="ag-vtype">Vehicle Type</Form.Label>
              <Form.Select id="ag-vtype" value={form.vehicleType} onChange={set('vehicleType')}>
                {VEHICLE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col md={6}>
              <Form.Label htmlFor="ag-vnum">Vehicle Number</Form.Label>
              <Form.Control
                id="ag-vnum"
                value={form.vehicleNumber}
                onChange={set('vehicleNumber')}
                placeholder="e.g. TN 01 AB 1234"
              />
            </Col>
            <Col md={6}>
              <Form.Label htmlFor="ag-dl">Driving License No.</Form.Label>
              <Form.Control
                id="ag-dl"
                value={form.drivingLicense}
                onChange={set('drivingLicense')}
                placeholder="e.g. TN0120130123456"
              />
            </Col>
            <Col md={6}>
              <Form.Label htmlFor="ag-pins">Service Pincodes</Form.Label>
              <Form.Control
                id="ag-pins"
                value={form.servicePincodes}
                onChange={set('servicePincodes')}
                placeholder="600001, 600002, 600003"
              />
              <Form.Text className="text-muted">Comma-separated list of pincodes this agent serves.</Form.Text>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer className="vp-modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save Changes' : 'Create Agent'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Profile View Modal
// ─────────────────────────────────────────────────────────────────────────────
function AgentProfileModal({ agentId, onClose, onStatusChanged }) {
  const { data, loading, error, reload } = useAsync(
    () => adminService.deliveryAgent(agentId),
    [agentId],
  );
  const [busyStatus, setBusyStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const ag = data?.agent;

  async function handleSetStatus(newStatus) {
    setBusyStatus(true);
    setStatusMsg(null);
    try {
      await adminService.updateDeliveryAgent(agentId, {
        status: newStatus,
        isAvailable: newStatus === 'active',
      });
      setStatusMsg({
        variant: 'success',
        text: `Agent status successfully updated to "${newStatus.replace(/_/g, ' ')}".`,
      });
      reload();
      if (onStatusChanged) onStatusChanged();
    } catch (err) {
      setStatusMsg({ variant: 'danger', text: normalizeError(err).message });
    } finally {
      setBusyStatus(false);
    }
  }

  return (
    <Modal
      show
      onHide={onClose}
      size="lg"
      scrollable
      centered
      className="vp-modal-scrollable"
      aria-labelledby="agent-profile-title"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5" id="agent-profile-title">
          Agent Profile
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {statusMsg && (
          <Alert variant={statusMsg.variant} dismissible onClose={() => setStatusMsg(null)} className="mb-3">
            {statusMsg.text}
          </Alert>
        )}
        {loading && <Skeleton style={{ width: '100%', height: 240 }} />}
        {error && <ErrorState error={error} onRetry={reload} />}
        {ag && (
          <>
            {/* Pending approval callout */}
            {ag.status === 'pending_approval' && (
              <Alert variant="warning" className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
                <div>
                  <strong className="d-block">Pending Admin Approval</strong>
                  <small className="text-muted">
                    This delivery agent cannot receive or accept delivery assignments until approved.
                  </small>
                </div>
                <Button
                  variant="success"
                  size="sm"
                  disabled={busyStatus}
                  onClick={() => handleSetStatus('active')}
                >
                  {busyStatus ? 'Approving…' : '✓ Approve Delivery Agent'}
                </Button>
              </Alert>
            )}

            {/* Header card */}
            <div
              className="d-flex align-items-center gap-3 p-3 mb-4 rounded-3"
              style={{ background: '#f8f9fa' }}
            >
              <div
                className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0"
                style={{ width: 60, height: 60, background: '#0d6efd', fontSize: '1.2rem' }}
              >
                {agentInitials(ag.name)}
              </div>
              <div>
                <h5 className="mb-0 fw-bold">{ag.name}</h5>
                <small className="text-muted">{ag.email}</small>
                <div className="mt-1 d-flex gap-2 flex-wrap">
                  <StatusBadge status={ag.status} />
                  {availBadge(ag.availability)}
                </div>
              </div>
            </div>

            {/* Stats row */}
            <Row className="g-3 mb-4">
              {[
                { label: 'Total Assigned', value: ag.totalAssigned, color: '#6366f1' },
                { label: 'Completed', value: ag.completedDeliveries, color: '#22c55e' },
                { label: 'Active', value: ag.pendingDeliveries, color: '#f59e0b' },
                { label: 'Failed', value: ag.failedDeliveries, color: '#ef4444' },
              ].map((s) => (
                <Col xs={6} md={3} key={s.label}>
                  <div
                    className="text-center p-3 rounded-3"
                    style={{ background: '#f8f9fa', borderTop: `3px solid ${s.color}` }}
                  >
                    <div className="fw-bold fs-5" style={{ color: s.color }}>
                      {s.value}
                    </div>
                    <small className="text-muted">{s.label}</small>
                  </div>
                </Col>
              ))}
            </Row>

            {/* Info */}
            <h6 className="text-muted mb-3 border-bottom pb-2">Contact & Vehicle</h6>
            <InfoRow label="Phone" value={ag.phone || '–'} />
            <InfoRow label="Vehicle" value={`${ag.vehicleType} · ${ag.vehicleNumber || '–'}`} />
            <InfoRow label="Driving License" value={ag.drivingLicense || '–'} />
            <InfoRow
              label="Service Pincodes"
              value={ag.servicePincodes?.length ? ag.servicePincodes.join(', ') : '–'}
            />
            <InfoRow label="Rating" value={`${ag.rating?.toFixed(1)} (${ag.ratingCount} reviews)`} />
            <InfoRow label="Earnings" value={formatINR((ag.earningsPaise || 0) / 100)} />
            <InfoRow label="Registered" value={formatDateTime(ag.createdAt)} />

            {/* Active shipments */}
            {data?.activeShipments?.length > 0 && (
              <>
                <h6 className="text-muted mt-4 mb-3 border-bottom pb-2">
                  Active Deliveries ({data.activeShipments.length})
                </h6>
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Customer</th>
                        <th>Destination</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.activeShipments.map((s) => (
                        <tr key={s._id}>
                          <td className="fw-semibold">{s.orderId?.orderNumber || '–'}</td>
                          <td>{s.destinationAddress?.name || '–'}</td>
                          <td style={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {`${s.destinationAddress?.city || ''}, ${s.destinationAddress?.pincode || ''}`.trim()}
                          </td>
                          <td>{statusBadge(s.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Recent deliveries */}
            {data?.recentDeliveries?.length > 0 && (
              <>
                <h6 className="text-muted mt-4 mb-3 border-bottom pb-2">
                  Recent Delivery History
                </h6>
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Status</th>
                        <th>Delivered At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentDeliveries.map((s) => (
                        <tr key={s._id}>
                          <td className="fw-semibold">{s.orderId?.orderNumber || '–'}</td>
                          <td>{statusBadge(s.status)}</td>
                          <td>{s.deliveredAt ? formatDateTime(s.deliveredAt) : '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="vp-modal-footer d-flex justify-content-between flex-wrap gap-2">
        <div className="d-flex gap-2 flex-wrap">
          {ag && ag.status === 'pending_approval' && (
            <Button
              variant="success"
              size="sm"
              disabled={busyStatus}
              onClick={() => handleSetStatus('active')}
            >
              {busyStatus ? 'Approving…' : '✓ Approve Agent'}
            </Button>
          )}
          {ag && ag.status === 'active' && (
            <Button
              variant="outline-warning"
              size="sm"
              disabled={busyStatus}
              onClick={() => handleSetStatus('suspended')}
            >
              {busyStatus ? 'Updating…' : 'Suspend Agent'}
            </Button>
          )}
          {ag && (ag.status === 'suspended' || ag.status === 'deactivated') && (
            <Button
              variant="outline-success"
              size="sm"
              disabled={busyStatus}
              onClick={() => handleSetStatus('active')}
            >
              {busyStatus ? 'Activating…' : 'Reactivate Agent'}
            </Button>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Confirmation Modal
// ─────────────────────────────────────────────────────────────────────────────
function DeleteAgentModal({ agent, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function handleDelete() {
    setBusy(true);
    setErr(null);
    try {
      await adminService.deleteDeliveryAgent(agent.id);
      onDeleted();
    } catch (e) {
      setErr(normalizeError(e).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      show
      onHide={onClose}
      size="sm"
      centered
      className="vp-modal-scrollable"
      aria-labelledby="del-agent-title"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h6" id="del-agent-title">
          Delete Delivery Agent
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {err && (
          <Alert variant="danger" role="alert" className="mb-3" style={{ fontSize: '0.85rem' }}>
            {err}
          </Alert>
        )}
        <p className="mb-2">
          Are you sure you want to remove <strong>{agent.name}</strong>?
        </p>
        <p className="text-muted" style={{ fontSize: '0.85rem' }}>
          Agents with active deliveries cannot be deleted. Reassign or complete all active orders
          first.
        </p>
      </Modal.Body>
      <Modal.Footer className="vp-modal-footer">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete Agent'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Assign Agent Modal
// ─────────────────────────────────────────────────────────────────────────────
function AssignAgentModal({ shipment, onClose, onSaved }) {
  const { data } = useAsync(() => adminService.availableAgents(), []);
  const agents = data?.agents || [];
  const [agentId, setAgentId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!agentId) return;
    setErr(null);
    setBusy(true);
    try {
      await adminService.assignDelivery(shipment.id, { agentId, note: note.trim() || undefined });
      onSaved();
    } catch (e) {
      setErr(normalizeError(e).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      show
      onHide={onClose}
      size="md"
      scrollable
      centered
      className="vp-modal-scrollable"
      aria-labelledby="assign-title"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5" id="assign-title">
          Assign Delivery Agent
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit} className="vp-modal-form">
        <Modal.Body>
          {err && (
            <Alert variant="danger" role="alert">
              {err}
            </Alert>
          )}
          <p className="text-muted mb-3" style={{ fontSize: '0.9rem' }}>
            Order <strong>{shipment.orderNumber}</strong> → {shipment.customerName},{' '}
            {shipment.deliveryDestination}
          </p>

          <Form.Group className="mb-3">
            <Form.Label htmlFor="assign-agent">
              Select Delivery Agent <span className="text-danger">*</span>
            </Form.Label>
            <Form.Select
              id="assign-agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              required
            >
              <option value="">— Choose an agent —</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.vehicleType} · {a.activeDeliveries} active{' '}
                  {!a.isAvailable ? '(unavailable)' : ''}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group>
            <Form.Label htmlFor="assign-note">Note (optional)</Form.Label>
            <Form.Control
              id="assign-note"
              as="textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Priority delivery – handle with care"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="vp-modal-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !agentId}>
            {busy ? 'Assigning…' : 'Assign Agent'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Update Delivery Status Modal
// ─────────────────────────────────────────────────────────────────────────────
function UpdateStatusModal({ shipment, onClose, onSaved }) {
  const [status, setStatus] = useState(shipment.status);
  const [note, setNote] = useState('');
  const [failedReason, setFailedReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await adminService.updateDeliveryStatus(shipment.id, {
        status,
        note: note.trim() || undefined,
        failedReason: status === 'failed_delivery' ? failedReason.trim() : undefined,
      });
      onSaved();
    } catch (e) {
      setErr(normalizeError(e).message);
      setBusy(false);
    }
  }

  return (
    <Modal
      show
      onHide={onClose}
      size="sm"
      scrollable
      centered
      className="vp-modal-scrollable"
      aria-labelledby="status-title"
    >
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h6" id="status-title">
          Update Delivery Status
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit} className="vp-modal-form">
        <Modal.Body>
          {err && (
            <Alert variant="danger" role="alert" style={{ fontSize: '0.85rem' }}>
              {err}
            </Alert>
          )}
          <p className="text-muted mb-3" style={{ fontSize: '0.85rem' }}>
            Order <strong>{shipment.orderNumber}</strong>
          </p>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="new-status">New Status</Form.Label>
            <Form.Select
              id="new-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              required
            >
              {DELIVERY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          {status === 'failed_delivery' && (
            <Form.Group className="mb-3">
              <Form.Label htmlFor="fail-reason">Reason for Failure</Form.Label>
              <Form.Control
                id="fail-reason"
                as="textarea"
                rows={2}
                value={failedReason}
                onChange={(e) => setFailedReason(e.target.value)}
                placeholder="e.g. Customer not available, address not found"
              />
            </Form.Group>
          )}
          <Form.Group>
            <Form.Label htmlFor="status-note">Admin Note (optional)</Form.Label>
            <Form.Control
              id="status-note"
              as="textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Audit note for this status change"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="vp-modal-footer">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="primary" disabled={busy}>
            {busy ? 'Updating…' : 'Update Status'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1: Delivery Agents
// ─────────────────────────────────────────────────────────────────────────────
function DeliveryAgentsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [availFilter, setAvailFilter] = useState('');
  const [actionBusyId, setActionBusyId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const dSearch = useDebounce(search, 350);

  const [modal, setModal] = useState(null); // { type: 'create'|'edit'|'view'|'delete', agent? }

  const params = { page, search: dSearch, status: statusFilter, availability: availFilter };
  const { data, loading, error, reload } = useAsync(
    () => adminService.deliveryAgents(params),
    [page, dSearch, statusFilter, availFilter],
  );

  const agents = data?.items || [];
  const pendingCount = agents.filter((a) => a.status === 'pending_approval').length;

  function resetPage() {
    setPage(1);
  }

  function afterSave() {
    setModal(null);
    reload();
  }

  async function handleQuickApprove(id, newStatus = 'active') {
    setActionBusyId(id);
    setFeedback(null);
    try {
      await adminService.updateDeliveryAgent(id, {
        status: newStatus,
        isAvailable: newStatus === 'active',
      });
      setFeedback({
        variant: 'success',
        text: `Agent successfully ${newStatus === 'active' ? 'approved and activated' : newStatus}!`,
      });
      reload();
    } catch (e) {
      setFeedback({ variant: 'danger', text: normalizeError(e).message });
    } finally {
      setActionBusyId(null);
    }
  }

  return (
    <>
      {feedback && (
        <Alert variant={feedback.variant} dismissible onClose={() => setFeedback(null)} className="mb-3">
          {feedback.text}
        </Alert>
      )}

      {/* Pending approval banner */}
      {pendingCount > 0 && (
        <Alert variant="warning" className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3 py-2">
          <div>
            <strong>Action Needed:</strong> {pendingCount} delivery agent{pendingCount > 1 ? 's are' : ' is'} awaiting approval.
          </div>
          <Button
            size="sm"
            variant="outline-dark"
            onClick={() => { setStatusFilter('pending_approval'); resetPage(); }}
          >
            Show Pending Agents
          </Button>
        </Alert>
      )}

      {/* Toolbar */}
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <Form.Control
          placeholder="Search name, email, phone…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          style={{ maxWidth: 260 }}
          size="sm"
        />
        <Form.Select
          size="sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
          style={{ maxWidth: 180 }}
        >
          <option value="">All Account Statuses</option>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Form.Select>
        <Form.Select
          size="sm"
          value={availFilter}
          onChange={(e) => { setAvailFilter(e.target.value); resetPage(); }}
          style={{ maxWidth: 160 }}
        >
          <option value="">All Availability</option>
          <option value="available">Available</option>
          <option value="busy">Busy</option>
          <option value="offline">Offline</option>
        </Form.Select>
        <Button
          variant="primary"
          size="sm"
          className="ms-auto"
          onClick={() => setModal({ type: 'create' })}
        >
          + New Agent
        </Button>
      </div>

      {/* Stats summary */}
      {data && (
        <p className="text-muted mb-3" style={{ fontSize: '0.85rem' }}>
          Showing {agents.length} of {data.total} delivery agent{data.total !== 1 ? 's' : ''}
        </p>
      )}

      {loading && <Skeleton style={{ width: '100%', height: 200 }} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && agents.length === 0 && (
        <EmptyState
          title="No delivery agents found"
          text="Add your first delivery agent using the button above."
        />
      )}

      {!loading && agents.length > 0 && (
        <TableWrap>
          <table className="table table-sm table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Agent</th>
                <th>Contact</th>
                <th>Vehicle</th>
                <th>Account</th>
                <th>Availability</th>
                <th className="text-center">Deliveries</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((ag) => (
                <tr key={ag.id}>
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="rounded-circle d-flex align-items-center justify-content-center fw-bold text-white flex-shrink-0"
                        style={{
                          width: 36,
                          height: 36,
                          background: '#0d6efd',
                          fontSize: '0.75rem',
                        }}
                      >
                        {agentInitials(ag.name)}
                      </div>
                      <div>
                        <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>
                          {ag.name}
                        </div>
                        <small className="text-muted">{ag.email}</small>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    <div>{ag.phone}</div>
                    <small className="text-muted">{ag.username}</small>
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    <div className="text-capitalize">{ag.vehicleType}</div>
                    {ag.vehicleNumber && ag.vehicleNumber !== '–' && (
                      <small className="text-muted">{ag.vehicleNumber}</small>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={ag.status} />
                  </td>
                  <td>{availBadge(ag.availability)}</td>
                  <td className="text-center" style={{ fontSize: '0.82rem' }}>
                    <div>
                      <span className="text-success fw-semibold">{ag.completedDeliveries}</span>
                      <span className="text-muted"> / </span>
                      <span className="text-muted">{ag.totalAssigned}</span>
                    </div>
                    {ag.pendingDeliveries > 0 && (
                      <small className="text-warning">
                        {ag.pendingDeliveries} active
                      </small>
                    )}
                  </td>
                  <td className="text-end">
                    <div className="d-flex gap-1 justify-content-end flex-wrap">
                      {ag.status === 'pending_approval' && (
                        <Button
                          size="sm"
                          variant="success"
                          disabled={actionBusyId === ag.id}
                          onClick={() => handleQuickApprove(ag.id, 'active')}
                          title="Approve this agent"
                        >
                          {actionBusyId === ag.id ? '…' : '✓ Approve'}
                        </Button>
                      )}
                      {ag.status === 'suspended' && (
                        <Button
                          size="sm"
                          variant="outline-success"
                          disabled={actionBusyId === ag.id}
                          onClick={() => handleQuickApprove(ag.id, 'active')}
                          title="Reactivate agent"
                        >
                          {actionBusyId === ag.id ? '…' : 'Reactivate'}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline-info"
                        onClick={() => setModal({ type: 'view', agent: ag })}
                      >
                        View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => setModal({ type: 'edit', agent: ag })}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => setModal({ type: 'delete', agent: ag })}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {data?.pages > 1 && (
        <Pagination page={page} pages={data.pages} onChange={setPage} />
      )}

      {/* Modals */}
      {modal?.type === 'create' && (
        <AgentFormModal onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.type === 'edit' && (
        <AgentFormModal agent={modal.agent} onClose={() => setModal(null)} onSaved={afterSave} />
      )}
      {modal?.type === 'view' && (
        <AgentProfileModal
          agentId={modal.agent.id}
          onClose={() => setModal(null)}
          onStatusChanged={afterSave}
        />
      )}
      {modal?.type === 'delete' && (
        <DeleteAgentModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onDeleted={afterSave}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2: Deliveries & Assignments
// ─────────────────────────────────────────────────────────────────────────────
function DeliveriesTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const dSearch = useDebounce(search, 350);

  const [modal, setModal] = useState(null); // { type: 'assign'|'status', shipment }

  const params = {
    page,
    search: dSearch,
    status: statusFilter,
    agentId: agentFilter || undefined,
  };

  const { data, loading, error, reload } = useAsync(
    () => adminService.deliveries(params),
    [page, dSearch, statusFilter, agentFilter],
  );

  const { data: agentsData } = useAsync(() => adminService.deliveryAgents({ limit: 100 }), []);
  const allAgents = agentsData?.items || [];

  const shipments = data?.items || [];

  function resetPage() {
    setPage(1);
  }

  function afterSave() {
    setModal(null);
    reload();
  }

  return (
    <>
      {/* Toolbar */}
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <Form.Control
          placeholder="Search order #, customer, agent…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          style={{ maxWidth: 260 }}
          size="sm"
        />
        <Form.Select
          size="sm"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
          style={{ maxWidth: 200 }}
        >
          <option value="">All Delivery Statuses</option>
          <option value="pending_assignment">Pending Assignment</option>
          <option value="active">Active (In Progress)</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed / Returned</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Form.Select>
        <Form.Select
          size="sm"
          value={agentFilter}
          onChange={(e) => { setAgentFilter(e.target.value); resetPage(); }}
          style={{ maxWidth: 200 }}
        >
          <option value="">All Agents</option>
          <option value="unassigned">Unassigned</option>
          {allAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Form.Select>
      </div>

      {data && (
        <p className="text-muted mb-3" style={{ fontSize: '0.85rem' }}>
          Showing {shipments.length} of {data.total} shipment{data.total !== 1 ? 's' : ''}
        </p>
      )}

      {loading && <Skeleton style={{ width: '100%', height: 200 }} />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {!loading && !error && shipments.length === 0 && (
        <EmptyState
          title="No deliveries found"
          text="Deliveries will appear here once orders are placed and shipments are created."
        />
      )}

      {!loading && shipments.length > 0 && (
        <TableWrap>
          <table className="table table-sm table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Order</th>
                <th>Pickup (Vendor)</th>
                <th>Destination (Customer)</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Assigned</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>
                      #{s.orderNumber}
                    </div>
                    <small className="text-muted">{formatDateTime(s.orderDate)}</small>
                  </td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 160 }}>
                    <div className="fw-semibold">{s.vendorName}</div>
                    <div className="text-muted text-truncate" title={s.pickupLocation}>
                      {s.pickupLocation}
                    </div>
                    {s.pickupContact && s.pickupContact !== '–' && (
                      <small>📞 {s.pickupContact}</small>
                    )}
                  </td>
                  <td style={{ fontSize: '0.82rem', maxWidth: 180 }}>
                    <div className="fw-semibold">{s.customerName}</div>
                    <div className="text-muted text-truncate" title={s.deliveryDestination}>
                      {s.deliveryDestination}
                    </div>
                    {s.customerPhone && s.customerPhone !== '–' && (
                      <small>📞 {s.customerPhone}</small>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {s.deliveryAgentId ? (
                      <>
                        <div>{s.deliveryAgentName}</div>
                        {s.deliveryAgentPhone !== '–' && (
                          <small className="text-muted">{s.deliveryAgentPhone}</small>
                        )}
                      </>
                    ) : (
                      <span className="text-muted fst-italic">Unassigned</span>
                    )}
                  </td>
                  <td>{statusBadge(s.status)}</td>
                  <td style={{ fontSize: '0.82rem' }}>
                    {s.assignedAt ? formatDateTime(s.assignedAt) : '–'}
                  </td>
                  <td className="text-end">
                    <div className="d-flex gap-1 justify-content-end flex-wrap">
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => setModal({ type: 'assign', shipment: s })}
                        title={s.deliveryAgentId ? 'Reassign agent' : 'Assign agent'}
                      >
                        {s.deliveryAgentId ? 'Reassign' : 'Assign'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => setModal({ type: 'status', shipment: s })}
                      >
                        Status
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      {data?.pages > 1 && (
        <Pagination page={page} pages={data.pages} onChange={setPage} />
      )}

      {/* Modals */}
      {modal?.type === 'assign' && (
        <AssignAgentModal
          shipment={modal.shipment}
          onClose={() => setModal(null)}
          onSaved={afterSave}
        />
      )}
      {modal?.type === 'status' && (
        <UpdateStatusModal
          shipment={modal.shipment}
          onClose={() => setModal(null)}
          onSaved={afterSave}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminDeliveryAgents() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="h4 fw-bold mb-1">Delivery Agent Management</h1>
        <p className="text-muted mb-0" style={{ fontSize: '0.9rem' }}>
          Manage delivery agents, assignments, and track order delivery status.
        </p>
      </div>

      <Tabs defaultActiveKey="agents" id="delivery-tabs" className="mb-4">
        <Tab eventKey="agents" title="🚴 Delivery Agents">
          <DeliveryAgentsTab />
        </Tab>
        <Tab eventKey="deliveries" title="📦 Deliveries & Assignments">
          <DeliveriesTab />
        </Tab>
      </Tabs>
    </div>
  );
}
