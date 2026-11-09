import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import FormField from '../../components/FormField.jsx';
import ImageUploader from '../../components/ImageUploader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal, StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime } from '../../utils/format.js';

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const soon = (days) => toLocalInput(new Date(Date.now() + days * 86400000));
const validDestination = (v) =>
  (v.startsWith('/') && !v.startsWith('//')) || /^https:\/\/\S+$/i.test(v);

export function validateBanner(f, image) {
  const e = {};
  if (f.title.trim().length < 2) e.title = 'Enter a title';
  if (!validDestination(f.destination.trim()))
    e.destination = 'Use a path like /c/electronics or an https:// URL';
  if (!f.startAt) e.startAt = 'Choose a start';
  if (!f.endAt) e.endAt = 'Choose an end';
  if (f.startAt && f.endAt && new Date(f.endAt) <= new Date(f.startAt))
    e.endAt = 'End must be after start';
  if (!image.length) e.image = 'Upload an image';
  return e;
}

function BannerModal({ banner, onClose, onSaved }) {
  const edit = !!banner;
  const [f, setF] = useState(
    edit
      ? {
          title: banner.title,
          description: banner.description || '',
          ctaLabel: banner.ctaLabel || '',
          destination: banner.destination,
          kind: banner.kind,
          startAt: toLocalInput(banner.startAt),
          endAt: toLocalInput(banner.endAt),
          isActive: banner.isActive,
          sortOrder: String(banner.sortOrder),
        }
      : {
          title: '',
          description: '',
          ctaLabel: '',
          destination: '/',
          kind: 'banner',
          startAt: soon(0),
          endAt: soon(14),
          isActive: true,
          sortOrder: '0',
        },
  );
  const [image, setImage] = useState(edit ? [{ key: banner.imageKey, url: banner.imageUrl }] : []);
  const [errors, setErrors] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function save(e) {
    e.preventDefault();
    const v = validateBanner(f, image);
    setErrors(v);
    if (Object.keys(v).length) return;
    const body = {
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      ctaLabel: f.ctaLabel.trim() || undefined,
      destination: f.destination.trim(),
      kind: f.kind,
      startAt: new Date(f.startAt).toISOString(),
      endAt: new Date(f.endAt).toISOString(),
      isActive: f.isActive,
      sortOrder: Number(f.sortOrder) || 0,
      imageKey: image[0].key,
    };
    setBusy(true);
    try {
      await (edit ? adminService.updateBanner(banner._id, body) : adminService.createBanner(body));
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
    <Modal show onHide={onClose} size="lg" scrollable centered className="vp-modal-scrollable">
      <Form onSubmit={save} noValidate className="vp-modal-form">
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {edit ? 'Edit banner' : 'New banner or advertisement'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {err && (
            <Alert variant="danger" role="alert" className="mb-3">
              {err}
            </Alert>
          )}
          <FormField label="Title" value={f.title} onChange={set('title')} error={errors.title} />
          <FormField
            label="Description (optional)"
            value={f.description}
            onChange={set('description')}
            error={errors.description}
          />
          <div className="row g-3 mb-3">
            <div className="col-12 col-md-6">
              <FormField
                label="Button text (optional)"
                value={f.ctaLabel}
                onChange={set('ctaLabel')}
              />
            </div>
            <div className="col-12 col-md-6">
              <Form.Group controlId="bk">
                <Form.Label>Type</Form.Label>
                <Form.Select value={f.kind} onChange={set('kind')}>
                  <option value="banner">Banner</option>
                  <option value="festival">Festival promotion</option>
                  <option value="launch">Product launch</option>
                  <option value="ad">Advertisement</option>
                </Form.Select>
              </Form.Group>
            </div>
          </div>
          <FormField
            label="Destination"
            value={f.destination}
            onChange={set('destination')}
            error={errors.destination}
            hint="Where the banner links to, e.g. /c/fashion or https://…"
          />
          <div className="row g-3 mb-3">
            <div className="col-12 col-md-5">
              <FormField
                label="Starts"
                type="datetime-local"
                value={f.startAt}
                onChange={set('startAt')}
                error={errors.startAt}
              />
            </div>
            <div className="col-12 col-md-5">
              <FormField
                label="Ends"
                type="datetime-local"
                value={f.endAt}
                onChange={set('endAt')}
                error={errors.endAt}
              />
            </div>
            <div className="col-12 col-md-2">
              <FormField
                label="Order"
                inputMode="numeric"
                value={f.sortOrder}
                onChange={set('sortOrder')}
              />
            </div>
          </div>
          <Form.Check
            id="act"
            className="mb-3"
            label="Active (shown when inside its dates)"
            checked={f.isActive}
            onChange={set('isActive')}
          />
          <div className="vp-banner-uploader">
            <ImageUploader
              purpose="banner"
              label="Banner image (wide, about 1600×520)"
              items={image}
              onChange={setImage}
              max={1}
            />
          </div>
          {errors.image && (
            <div className="text-danger small mt-1" role="alert">
              {errors.image}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onClose} disabled={busy}>
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

export default function AdminBanners() {
  const list = useAsync(() => adminService.banners(), []);
  const [modal, setModal] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function doDelete() {
    setBusy(true);
    try {
      const r = await adminService.deleteBanner(del._id);
      setMsg({
        v: 'success',
        t: `“${del.title}” was permanently deleted${r.image === 'deleted' ? ' along with its image' : r.image === 'still-referenced' ? '. Its image is still used elsewhere and was kept' : '. The image could not be removed from storage and will be cleaned up later'}.`,
      });
      setDel(null);
      list.reload();
    } catch (err) {
      setMsg({ v: 'danger', t: normalizeError(err).message });
      setDel(null);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(b) {
    try {
      await adminService.updateBanner(b._id, { isActive: !b.isActive });
      list.reload();
    } catch (err) {
      setMsg({ v: 'danger', t: normalizeError(err).message });
    }
  }
  return (
    <>
      <div className="vp-dash-bar">
        <h1 className="vp-dash-h1 mb-0">Banners and ads</h1>
        <Button variant="dark" onClick={() => setModal('new')}>
          New banner
        </Button>
      </div>
      {msg && (
        <Alert
          variant={msg.v}
          role={msg.v === 'danger' ? 'alert' : 'status'}
          dismissible
          onClose={() => setMsg(null)}
        >
          {msg.t}
        </Alert>
      )}
      {list.loading && <Skeleton style={{ width: '100%', height: 160 }} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && (
        <EmptyState
          title="No banners yet"
          action={
            <Button variant="dark" onClick={() => setModal('new')}>
              Create the first banner
            </Button>
          }
        >
          Banners appear on the homepage while they are active and inside their dates.
        </EmptyState>
      )}
      {list.data?.length > 0 && (
        <TableWrap>
          <table className="table vp-table align-middle">
            <thead>
              <tr>
                <th scope="col">Banner</th>
                <th scope="col">Schedule</th>
                <th scope="col">Clicks</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((b) => (
                <tr key={b._id}>
                  <td>
                    <span className="vp-cell-prod">
                      <img
                        src={b.imageUrl}
                        alt=""
                        width="80"
                        height="26"
                        className="vp-cell-wide"
                      />
                      <span>
                        {b.title}
                        <small className="d-block text-secondary text-capitalize">
                          {b.kind} → {b.destination}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td className="small">
                    {formatDateTime(b.startAt)}
                    <br />
                    to {formatDateTime(b.endAt)}
                  </td>
                  <td>{b.clicks}</td>
                  <td>
                    <StatusBadge status={b.live ? 'live' : b.isActive ? 'scheduled' : 'inactive'} />
                  </td>
                  <td className="text-nowrap">
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="me-1"
                      onClick={() => setModal(b)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="me-1"
                      onClick={() => toggle(b)}
                    >
                      {b.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button size="sm" variant="outline-danger" onClick={() => setDel(b)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {modal && (
        <BannerModal
          banner={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            list.reload();
          }}
        />
      )}
      <ConfirmModal
        show={!!del}
        title="Delete this banner permanently?"
        confirmLabel="Delete permanently"
        danger
        busy={busy}
        onCancel={() => setDel(null)}
        onConfirm={doDelete}
      >
        “{del?.title}” will be removed from the database and the shop immediately, and its image
        deleted from storage unless something else uses it. This cannot be undone. To hide it
        temporarily, use Deactivate instead.
      </ConfirmModal>
    </>
  );
}
