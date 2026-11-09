import { Button, Modal } from 'react-bootstrap';

export function ConfirmModal({
  show,
  title,
  children,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal show={show} onHide={onCancel} centered scrollable className="vp-modal-scrollable">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5">
          {title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'dark'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="vp-stat">
      <span className="vp-stat-l">{label}</span>
      <strong className="vp-stat-v">{value ?? '–'}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const tone =
    {
      active: 'success',
      live: 'success',
      pending_approval: 'warning',
      suspended: 'danger',
      rejected: 'danger',
      hidden: 'danger',
      inactive: 'secondary',
      deactivated: 'secondary',
      new: 'primary',
      resolved: 'secondary',
    }[status] || 'secondary';
  const text = { pending_approval: 'Pending approval' }[status] || status.replace('_', ' ');
  return <span className={`badge text-bg-${tone} text-capitalize`}>{text}</span>;
}

export const TableWrap = ({ children }) => (
  <div className="vp-table-wrap" tabIndex={0} role="region" aria-label="Data table">
    {children}
  </div>
);
