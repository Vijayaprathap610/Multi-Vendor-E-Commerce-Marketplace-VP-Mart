import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import Pagination from '../../components/Pagination.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { Stat, StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime } from '../../utils/format.js';

function Detail({ id, onClose, onChanged }) {
  const d = useAsync(() => adminService.vendor(id), [id]);
  const [reason, setReason] = useState('');
  const [warn, setWarn] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [safeguards, setSafeguards] = useState(null);
  const v = d.data?.vendor;
  const p = v?.profile;
  async function act(fn, ok) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ v: 'success', t: ok });
      d.reload();
      onChanged();
    } catch (err) {
      setMsg({ v: 'danger', t: normalizeError(err).message });
    } finally {
      setBusy(false);
    }
  }
  const status = (s) =>
    act(() => adminService.setUserStatus(id, s, reason || undefined), `Vendor is now ${s}.`);

  async function handleDelete() {
    setBusy(true);
    setSafeguards(null);
    setMsg(null);
    try {
      await adminService.deleteVendor(id, reason || 'Admin deleted vendor');
      setShowDelete(false);
      setMsg({ v: 'success', t: 'Vendor safely decommissioned and archived.' });
      d.reload();
      onChanged();
    } catch (err) {
      const data = err.response?.data?.error;
      if (data?.safeguards) {
        setSafeguards(data.safeguards);
      } else {
        setMsg({ v: 'danger', t: normalizeError(err).message });
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal show onHide={onClose} size="lg" scrollable centered className="vp-modal-scrollable" aria-labelledby="vd-title">
      <Modal.Header closeButton>
        <Modal.Title as="h2" className="h5" id="vd-title">
          {p?.shopName || v?.name || 'Vendor'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {d.loading && <Skeleton style={{ width: '100%', height: 200 }} />}
        {d.error && <ErrorState error={d.error} onRetry={d.reload} />}
        {msg && (
          <Alert variant={msg.v} role={msg.v === 'danger' ? 'alert' : 'status'}>
            {msg.t}
          </Alert>
        )}
        {v && (
          <>
            <p>
              <StatusBadge status={v.status} />{' '}
              <span className="ms-2">
                {v.name} · {v.email}
                {v.phone && ` · ${v.phone}`}
              </span>
            </p>
            {!p ? (
              <Alert variant="secondary">This vendor has not started their shop profile.</Alert>
            ) : (
              <dl className="vp-dl">
                <div>
                  <dt>Business</dt>
                  <dd>
                    {p.businessName || '–'}
                    {p.gstin && ` · GSTIN ${p.gstin}`}
                  </dd>
                </div>
                <div>
                  <dt>Licences</dt>
                  <dd>
                    FSSAI: {p.fssaiLicense || 'none'} · Drug: {p.drugLicense || 'none'}
                  </dd>
                </div>
                <div>
                  <dt>Pickup address</dt>
                  <dd>
                    {[
                      p.pickupAddress?.line1,
                      p.pickupAddress?.city,
                      p.pickupAddress?.state,
                      p.pickupAddress?.pincode,
                    ]
                      .filter(Boolean)
                      .join(', ') || '–'}
                  </dd>
                </div>
                <div>
                  <dt>Payout (masked)</dt>
                  <dd>
                    {p.payout
                      ? `${p.payout.accountHolder || ''} · ${p.payout.accountMasked || '–'} · ${p.payout.ifsc || ''}`
                      : '–'}
                  </dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>
                    {p.delivery?.processingDays ?? 1} day processing · coverage{' '}
                    {p.delivery?.coverage?.mode || 'all'}
                  </dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{p.submittedAt ? formatDateTime(p.submittedAt) : 'Not submitted'}</dd>
                </div>
                {p.warnings?.length > 0 && (
                  <div>
                    <dt>Warnings</dt>
                    <dd>
                      {p.warnings.map((w) => `${w.message} (${formatDateTime(w.at)})`).join('; ')}
                    </dd>
                  </div>
                )}
              </dl>
            )}
            <div className="vp-stats mb-3">
              <Stat label="Listings" value={d.data.metrics.listings} />
              <Stat label="Unique products" value={d.data.metrics.uniqueProducts} />
              <Stat label="Stock units" value={d.data.metrics.stockUnits} />
              <Stat label="Hidden" value={d.data.metrics.hidden} />
            </div>
            <Form.Group className="mb-3" controlId="reason">
              <Form.Label>Reason (recorded in the audit log)</Form.Label>
              <Form.Control
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
              />
            </Form.Group>
            <div className="d-flex gap-2 flex-wrap mb-3">
              {v.status === 'pending_approval' && (
                <>
                  <Button
                    variant="dark"
                    disabled={busy || !p?.submittedAt}
                    onClick={() => status('active')}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline-danger"
                    disabled={busy}
                    onClick={() => status('rejected')}
                  >
                    Reject
                  </Button>
                </>
              )}
              {v.status === 'active' && (
                <Button
                  variant="outline-danger"
                  disabled={busy}
                  onClick={() => status('suspended')}
                >
                  Suspend
                </Button>
              )}
              {['suspended', 'rejected', 'deactivated'].includes(v.status) && (
                <Button variant="dark" disabled={busy} onClick={() => status('active')}>
                  Reinstate
                </Button>
              )}
              {v.status !== 'deleted' && (
                <Button
                  variant="outline-danger"
                  className="ms-auto"
                  disabled={busy}
                  onClick={() => setShowDelete(true)}
                >
                  Delete Vendor
                </Button>
              )}
              {v.status === 'pending_approval' && !p?.submittedAt && (
                <small className="text-secondary align-self-center">
                  Can be approved after the profile is submitted.
                </small>
              )}
            </div>

            <Modal show={showDelete} onHide={() => { setShowDelete(false); setSafeguards(null); }} centered scrollable className="vp-modal-scrollable">
              <Modal.Header closeButton>
                <Modal.Title as="h2" className="h5 text-danger">Delete Vendor with Safeguards</Modal.Title>
              </Modal.Header>
              <Modal.Body>
                {safeguards ? (
                  <Alert variant="danger">
                    <strong className="d-block mb-1">Deletion Blocked by System Safeguards:</strong>
                    <ul className="mb-0 ps-3">
                      {safeguards.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ul>
                  </Alert>
                ) : (
                  <p>
                    Are you sure you want to permanently delete and anonymize this vendor account?
                    VP Mart’s transactional integrity checks will verify there are no active shipments,
                    pending refunds, or unpaid balances before proceeding.
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="outline-secondary" onClick={() => { setShowDelete(false); setSafeguards(null); }}>
                  {safeguards ? 'Close' : 'Cancel'}
                </Button>
                {!safeguards && (
                  <Button variant="danger" disabled={busy} onClick={handleDelete}>
                    {busy ? 'Verifying Safeguards…' : 'Confirm Delete'}
                  </Button>
                )}
              </Modal.Footer>
            </Modal>
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                if (warn.trim().length >= 5)
                  act(
                    () => adminService.warnVendor(id, warn.trim()).then(() => setWarn('')),
                    'Warning recorded.',
                  );
              }}
              className="d-flex gap-2"
            >
              <Form.Control
                aria-label="Warning message"
                placeholder="Issue a warning (min 5 characters)"
                value={warn}
                onChange={(e) => setWarn(e.target.value)}
              />
              <Button
                type="submit"
                variant="outline-dark"
                disabled={busy || warn.trim().length < 5}
              >
                Warn
              </Button>
            </Form>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}

export default function AdminVendors() {
  const [status, setStatus] = useState('pending_approval');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const dq = useDebounce(q, 300);
  const list = useAsync(
    () => adminService.vendors({ status: status || undefined, q: dq || undefined, page }),
    [status, dq, page],
  );
  const d = list.data;
  return (
    <>
      <h1 className="vp-dash-h1">Vendors</h1>
      <div className="vp-filters-row">
        <Form.Control
          type="search"
          aria-label="Search vendors"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Form.Select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="pending_approval">Pending approval</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
          <option value="deactivated">Deactivated</option>
        </Form.Select>
      </div>
      {list.loading && !d && <Skeleton style={{ width: '100%', height: 140 }} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {d?.items.length === 0 && (
        <EmptyState title="No vendors match">Try a different status or search.</EmptyState>
      )}
      {d?.items.length > 0 && (
        <TableWrap>
          <table className="table vp-table align-middle">
            <thead>
              <tr>
                <th scope="col">Shop</th>
                <th scope="col">Owner</th>
                <th scope="col">Status</th>
                <th scope="col">Submitted</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.profile?.shopName || <span className="text-secondary">Not set up</span>}
                  </td>
                  <td>
                    {v.name}
                    <small className="d-block text-secondary">{v.email}</small>
                  </td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td>{v.profile?.submittedAt ? formatDateTime(v.profile.submittedAt) : '–'}</td>
                  <td>
                    <Button size="sm" variant="outline-dark" onClick={() => setOpen(v.id)}>
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {d && <Pagination page={d.page} pages={d.pages} onChange={setPage} />}
      {open && <Detail id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}
