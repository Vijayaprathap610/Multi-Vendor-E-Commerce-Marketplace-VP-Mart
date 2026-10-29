import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import FormField from '../../components/FormField.jsx';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal, StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';

const ZONES = [
  ['national', 'Anywhere in India'],
  ['region', 'Same region'],
  ['circle', 'Same postal circle'],
  ['local', 'Same city area only'],
];
const blank = {
  name: '',
  description: '',
  parent: '',
  regulation: 'none',
  deviceFields: false,
  gstPercent: '18',
  maxZone: 'national',
  extraDays: '0',
};

function CategoryModal({ cat, tops, onClose, onSaved }) {
  const edit = !!cat;
  const [f, setF] = useState(
    edit
      ? {
          name: cat.name,
          description: cat.description || '',
          parent: cat.parent || '',
          regulation: cat.regulation,
          deviceFields: cat.deviceFields,
          gstPercent: String(cat.gstPercent),
          maxZone: cat.shipping?.maxZone || 'national',
          extraDays: String(cat.shipping?.extraDays ?? 0),
        }
      : blank,
  );
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function save(e) {
    e.preventDefault();
    const gst = Number(f.gstPercent);
    const next = {};
    if (f.name.trim().length < 2) next.name = 'Enter a name';
    if (!(gst >= 0 && gst <= 40)) next.gstPercent = '0 to 40';
    if (!/^\d+$/.test(f.extraDays) || Number(f.extraDays) > 14) next.extraDays = '0 to 14';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = {
      name: f.name.trim(),
      description: f.description.trim() || undefined,
      regulation: f.regulation,
      deviceFields: f.deviceFields,
      gstPercent: gst,
      shipping: { maxZone: f.maxZone, extraDays: Number(f.extraDays) },
      ...(edit ? {} : { parent: f.parent || null }),
    };
    setBusy(true);
    try {
      await (edit ? adminService.updateCategory(cat.id, body) : adminService.createCategory(body));
      onSaved();
    } catch (e2) {
      const n = normalizeError(e2);
      setErrors(n.fields);
      setErr(n.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal show onHide={onClose} centered>
      <Form onSubmit={save} noValidate>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {edit ? 'Edit category' : 'New category'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {err && (
            <Alert variant="danger" role="alert">
              {err}
            </Alert>
          )}
          <FormField label="Name" value={f.name} onChange={set('name')} error={errors.name} />
          {!edit && (
            <Form.Group className="mb-3" controlId="par">
              <Form.Label>Parent (leave empty for a top-level category)</Form.Label>
              <Form.Select value={f.parent} onChange={set('parent')}>
                <option value="">None (top level)</option>
                {tops.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}
          <FormField label="Description" value={f.description} onChange={set('description')} />
          <Form.Group className="mb-3" controlId="reg">
            <Form.Label>Regulation</Form.Label>
            <Form.Select value={f.regulation} onChange={set('regulation')}>
              <option value="none">None</option>
              <option value="food">Food (needs FSSAI + expiry)</option>
              <option value="medicine">Medicine (needs drug licence + expiry)</option>
              {(edit ? cat.parent : f.parent) && <option value="inherit">Same as parent</option>}
            </Form.Select>
          </Form.Group>
          <Form.Check
            id="dev"
            className="mb-3"
            label="Products have model / version / device type"
            checked={f.deviceFields}
            onChange={set('deviceFields')}
          />
          <div className="d-flex gap-2">
            <div className="flex-fill">
              <FormField
                label="GST %"
                inputMode="decimal"
                value={f.gstPercent}
                onChange={set('gstPercent')}
                error={errors.gstPercent}
              />
            </div>
            <div className="flex-fill">
              <Form.Group className="mb-3" controlId="zone">
                <Form.Label>Delivery range</Form.Label>
                <Form.Select value={f.maxZone} onChange={set('maxZone')}>
                  {ZONES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
            </div>
            <div className="flex-fill">
              <FormField
                label="Extra days"
                inputMode="numeric"
                value={f.extraDays}
                onChange={set('extraDays')}
                error={errors.extraDays}
              />
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="dark" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default function AdminCategories() {
  const list = useAsync(() => adminService.categories(), []);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');
  const items = list.data || [];
  const tops = items.filter((c) => !c.parent);
  const rows = tops.flatMap((t) => [t, ...items.filter((c) => String(c.parent) === t.id)]);

  async function toggle(c) {
    setError('');
    try {
      await adminService.updateCategory(c.id, { isActive: !c.isActive });
      setConfirm(null);
      list.reload();
    } catch (err) {
      setConfirm(null);
      setError(normalizeError(err).message);
    }
  }
  return (
    <>
      <div className="vp-dash-bar">
        <h1 className="vp-dash-h1 mb-0">Categories</h1>
        <Button variant="dark" onClick={() => setModal('new')}>
          New category
        </Button>
      </div>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
      {list.loading && <Skeleton style={{ width: '100%', height: 200 }} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && (
        <TableWrap>
          <table className="table vp-table align-middle">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Listings</th>
                <th scope="col">Rules</th>
                <th scope="col">GST</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className={c.parent ? 'vp-subrow' : ''}>
                  <td>
                    {c.parent && <span aria-hidden="true">↳ </span>}
                    {c.name}
                    <small className="d-block text-secondary">/{c.slug}</small>
                  </td>
                  <td>{c.listingCount}</td>
                  <td className="small">
                    {c.regulation !== 'none' && c.regulation !== 'inherit' ? c.regulation : ''}
                    {c.deviceFields ? ' device fields' : ''}
                    {c.shipping?.maxZone !== 'national' ? ` · ${c.shipping.maxZone} only` : ''}
                  </td>
                  <td>{c.gstPercent}%</td>
                  <td>
                    <StatusBadge status={c.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td className="text-nowrap">
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="me-1"
                      onClick={() => setModal(c)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={c.isActive ? 'outline-danger' : 'dark'}
                      onClick={() => (c.isActive ? setConfirm(c) : toggle(c))}
                    >
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {modal && (
        <CategoryModal
          cat={modal === 'new' ? null : modal}
          tops={tops}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            list.reload();
          }}
        />
      )}
      <ConfirmModal
        show={!!confirm}
        title={`Deactivate ${confirm?.name}?`}
        confirmLabel="Deactivate"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => toggle(confirm)}
      >
        Products in this category{confirm && !confirm.parent ? ' and its sub-categories' : ''} will
        be hidden from the shop. Nothing is deleted: listings, orders and financial records stay
        intact, and reactivating restores them.
      </ConfirmModal>
    </>
  );
}
