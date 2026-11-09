import { useState } from 'react';
import { Alert, Badge, Button, Form, Modal } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime } from '../../utils/format.js';
import { formatPaise } from '../../utils/money.js';
import { FiPlus, FiEdit2, FiTag } from 'react-icons/fi';

function toDatetimeLocal(isoOrDate) {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_COUPON = {
  title: '',
  codePrefix: '',
  discountType: 'fixed',
  discountValue: '',
  minOrder: '',
  maxDiscount: '',
  validFrom: toDatetimeLocal(new Date()),
  validTo: toDatetimeLocal(new Date(Date.now() + 30 * 86400000)),
  usageLimit: '',
  perBuyerLimit: 1,
  isPublic: true,
};

function getInitialForm(initial) {
  if (!initial || !initial.id) return { ...EMPTY_COUPON };
  return {
    id: initial.id,
    code: initial.code || '',
    title: initial.title || '',
    codePrefix: '',
    discountType: initial.discountType || 'fixed',
    discountValue:
      initial.discountType === 'fixed'
        ? initial.value
          ? initial.value / 100
          : ''
        : initial.value ?? '',
    minOrder: initial.minPurchasePaise ? initial.minPurchasePaise / 100 : '',
    maxDiscount: initial.maxDiscountPaise ? initial.maxDiscountPaise / 100 : '',
    validFrom: toDatetimeLocal(initial.validFrom) || toDatetimeLocal(new Date()),
    validTo: toDatetimeLocal(initial.validTo) || toDatetimeLocal(new Date(Date.now() + 30 * 86400000)),
    usageLimit: initial.usageLimit || '',
    perBuyerLimit: initial.perBuyerLimit || 1,
    isPublic: initial.isPublic ?? true,
    isActive: initial.isActive ?? true,
  };
}

function CouponForm({ initial = {}, onSave, onClose, busy }) {
  const [form, setForm] = useState(() => getInitialForm(initial));
  const [err, setErr] = useState(null);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null);

    const fromDate = new Date(form.validFrom);
    const toDate = new Date(form.validTo);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      setErr({ message: 'Please provide valid start and expiry dates.' });
      return;
    }
    if (toDate <= fromDate) {
      setErr({ message: 'Expiry date must be after the start date.' });
      return;
    }

    try {
      if (!initial?.id) {
        // Create general coupon
        const payload = {
          ...(form.title?.trim() ? { title: form.title.trim() } : {}),
          discountType: form.discountType,
          value:
            form.discountType === 'fixed'
              ? Math.round(Number(form.discountValue) * 100)
              : Math.round(Number(form.discountValue)),
          minPurchasePaise: form.minOrder ? Math.round(Number(form.minOrder) * 100) : 0,
          ...(form.discountType === 'percent' && form.maxDiscount
            ? { maxDiscountPaise: Math.round(Number(form.maxDiscount) * 100) }
            : {}),
          validFrom: fromDate.toISOString(),
          validTo: toDate.toISOString(),
          appliesToAll: true,
          isPublic: Boolean(form.isPublic),
          isActive: true,
          ...(form.codePrefix?.trim() ? { codePrefix: form.codePrefix.toUpperCase().trim() } : {}),
          ...(form.usageLimit ? { usageLimit: Number(form.usageLimit) } : {}),
          perBuyerLimit: form.perBuyerLimit ? Number(form.perBuyerLimit) : 1,
        };
        await onSave(payload);
      } else {
        // Update existing coupon
        const payload = {
          ...(form.title?.trim() ? { title: form.title.trim() } : {}),
          value:
            form.discountType === 'fixed'
              ? Math.round(Number(form.discountValue) * 100)
              : Math.round(Number(form.discountValue)),
          minPurchasePaise: form.minOrder ? Math.round(Number(form.minOrder) * 100) : 0,
          maxDiscountPaise:
            form.discountType === 'percent' && form.maxDiscount
              ? Math.round(Number(form.maxDiscount) * 100)
              : null,
          validFrom: fromDate.toISOString(),
          validTo: toDate.toISOString(),
          isPublic: Boolean(form.isPublic),
          isActive: Boolean(form.isActive),
          usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
          perBuyerLimit: form.perBuyerLimit ? Number(form.perBuyerLimit) : 1,
        };
        await onSave(payload);
      }
    } catch (ex) {
      setErr(normalizeError(ex));
    }
  }

  return (
    <Form onSubmit={submit} className="vp-modal-form">
      <Modal.Body>
        {err && <Alert variant="danger" className="py-2 small mb-3">{err.message}</Alert>}

        {initial?.id ? (
          <Form.Group className="mb-3">
            <Form.Label>Coupon Code</Form.Label>
            <Form.Control value={form.code} disabled />
            <Form.Text className="text-secondary">Coupon codes cannot be changed once issued.</Form.Text>
          </Form.Group>
        ) : (
          <Form.Group className="mb-3">
            <Form.Label>Code Prefix (Optional)</Form.Label>
            <Form.Control
              maxLength={12}
              value={form.codePrefix}
              onChange={(e) => set('codePrefix', e.target.value.toUpperCase())}
              placeholder="e.g. SAVE, FESTIVE, VP"
            />
            <Form.Text className="text-secondary">
              A unique server-verified code (e.g. SAVE20A1B2) will be generated automatically.
            </Form.Text>
          </Form.Group>
        )}

        <Form.Group className="mb-3">
          <Form.Label>Title / Promotion Name</Form.Label>
          <Form.Control
            maxLength={100}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. ₹100 Off On Orders Above ₹499"
          />
        </Form.Group>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-6">
            <Form.Label>Discount Type</Form.Label>
            <Form.Select
              value={form.discountType}
              onChange={(e) => set('discountType', e.target.value)}
              disabled={!!initial?.id}
            >
              <option value="fixed">Flat (₹ off)</option>
              <option value="percent">Percent (% off)</option>
            </Form.Select>
          </div>
          <div className="col-12 col-md-6">
            <Form.Label>
              {form.discountType === 'fixed' ? 'Discount Amount (₹)' : 'Discount Percentage (%)'}
            </Form.Label>
            <Form.Control
              required
              type="number"
              min={1}
              max={form.discountType === 'percent' ? 100 : undefined}
              value={form.discountValue}
              onChange={(e) => set('discountValue', e.target.value)}
              placeholder={form.discountType === 'fixed' ? '100' : '20'}
            />
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-6">
            <Form.Label>Min Order (₹)</Form.Label>
            <Form.Control
              type="number"
              min={0}
              value={form.minOrder}
              onChange={(e) => set('minOrder', e.target.value)}
              placeholder="0 = No minimum"
            />
            <Form.Text className="text-secondary">Minimum cart value in rupees</Form.Text>
          </div>
          {form.discountType === 'percent' && (
            <div className="col-12 col-md-6">
              <Form.Label>Max Discount Cap (₹)</Form.Label>
              <Form.Control
                type="number"
                min={1}
                value={form.maxDiscount}
                onChange={(e) => set('maxDiscount', e.target.value)}
                placeholder="Leave blank for no cap"
              />
              <Form.Text className="text-secondary">Upper limit on percentage discount</Form.Text>
            </div>
          )}
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-6">
            <Form.Label>Valid From</Form.Label>
            <Form.Control
              required
              type="datetime-local"
              value={form.validFrom}
              onChange={(e) => set('validFrom', e.target.value)}
            />
          </div>
          <div className="col-12 col-md-6">
            <Form.Label>Valid Until</Form.Label>
            <Form.Control
              required
              type="datetime-local"
              value={form.validTo}
              onChange={(e) => set('validTo', e.target.value)}
            />
          </div>
        </div>

        <div className="row g-3 mb-3">
          <div className="col-12 col-md-6">
            <Form.Label>Usage Limit</Form.Label>
            <Form.Control
              type="number"
              min={1}
              value={form.usageLimit}
              onChange={(e) => set('usageLimit', e.target.value)}
              placeholder="Leave blank for unlimited"
            />
          </div>
          <div className="col-12 col-md-6">
            <Form.Label>Limit Per Customer</Form.Label>
            <Form.Control
              type="number"
              min={1}
              value={form.perBuyerLimit}
              onChange={(e) => set('perBuyerLimit', e.target.value)}
              placeholder="1"
            />
          </div>
        </div>

        <Form.Check
          type="checkbox"
          id="isPublicCheck"
          label="Show in public deals & coupons list"
          checked={form.isPublic}
          onChange={(e) => set('isPublic', e.target.checked)}
          className="mb-2"
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="dark" disabled={busy}>
          {busy ? 'Saving…' : initial?.id ? 'Update Coupon' : 'Create Coupon'}
        </Button>
      </Modal.Footer>
    </Form>
  );
}

export default function AdminCoupons() {
  const [page] = useState(1);
  const coupons = useAsync(() => adminService.coupons({ page, limit: 30 }), [page]);
  const [modal, setModal] = useState(null); // null | { mode: 'create'|'edit', coupon }
  const [busy, setBusy] = useState(false);
  const [disableId, setDisableId] = useState(null);
  const [busy2, setBusy2] = useState(false);

  const rows = coupons.data?.items || [];

  async function handleSave(payload) {
    setBusy(true);
    try {
      if (modal?.coupon?.id) {
        await adminService.updateCoupon(modal.coupon.id, payload);
      } else {
        await adminService.createCoupon(payload);
      }
      coupons.reload();
      setModal(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy2(true);
    try {
      await adminService.updateCoupon(disableId, { isActive: false });
      coupons.reload();
      setDisableId(null);
    } finally {
      setBusy2(false);
    }
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="vp-dash-h1 mb-0">Coupons</h1>
        <Button variant="dark" size="sm" onClick={() => setModal({ mode: 'create' })}>
          <FiPlus className="me-1" /> Create coupon
        </Button>
      </div>

      {coupons.loading && <Skeleton style={{ width: '100%', height: 150 }} />}
      {coupons.error && <ErrorState error={coupons.error} onRetry={coupons.reload} />}
      {!coupons.loading && rows.length === 0 && (
        <EmptyState title="No coupons yet">
          Create your first coupon to offer discounts to buyers.
        </EmptyState>
      )}
      {rows.length > 0 && (
        <TableWrap>
          <table className="table table-hover table-sm vp-admin-table">
            <thead>
              <tr>
                <th>Code & Title</th>
                <th>Type</th>
                <th>Discount</th>
                <th>Min Order</th>
                <th>Redemptions</th>
                <th>Valid Until</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const isExpired = c.validTo && new Date() > new Date(c.validTo);
                const isScheduled = c.validFrom && new Date() < new Date(c.validFrom);
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="badge text-bg-light border fw-bold font-monospace">
                        <FiTag className="me-1" size={10} />{c.code}
                      </span>
                      {c.title && <div className="small text-secondary mt-1">{c.title}</div>}
                    </td>
                    <td className="small text-capitalize">
                      {c.discountType === 'fixed' ? 'Flat (₹)' : 'Percent (%)'}
                    </td>
                    <td className="small fw-semibold">
                      {c.discountType === 'fixed'
                        ? formatPaise(c.value, { fixed: true })
                        : `${c.value}%`}
                    </td>
                    <td className="small">
                      {c.minPurchasePaise ? formatPaise(c.minPurchasePaise, { fixed: true }) : '—'}
                    </td>
                    <td className="small">
                      {c.usedCount ?? 0}
                      {c.usageLimit ? ` / ${c.usageLimit}` : ''}
                    </td>
                    <td className="small text-secondary">
                      {c.validTo ? formatDateTime(c.validTo) : '—'}
                    </td>
                    <td>
                      <Badge bg={!c.isActive ? 'secondary' : isExpired ? 'warning' : isScheduled ? 'info' : 'success'} text={isExpired ? 'dark' : undefined}>
                        {!c.isActive ? 'Disabled' : isExpired ? 'Expired' : isScheduled ? 'Scheduled' : 'Active'}
                      </Badge>
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 text-dark"
                          title="Edit coupon"
                          onClick={() => setModal({ mode: 'edit', coupon: c })}
                        >
                          <FiEdit2 size={14} />
                        </Button>
                        {c.isActive && (
                          <Button
                            variant="link"
                            size="sm"
                            className="p-0 text-danger ms-2"
                            onClick={() => setDisableId(c.id)}
                          >
                            Disable
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      )}

      <Modal
        show={!!modal}
        onHide={() => setModal(null)}
        size="lg"
        centered
        scrollable
        className="vp-modal-scrollable"
      >
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">
            {modal?.coupon?.id ? 'Edit Coupon' : 'Create Coupon'}
          </Modal.Title>
        </Modal.Header>
        <CouponForm
          initial={modal?.coupon}
          onSave={handleSave}
          onClose={() => setModal(null)}
          busy={busy}
        />
      </Modal>

      <ConfirmModal
        show={!!disableId}
        title="Disable coupon"
        confirmLabel="Disable"
        danger
        busy={busy2}
        onConfirm={handleDisable}
        onCancel={() => setDisableId(null)}
      >
        This coupon will no longer be accepted at checkout.
      </ConfirmModal>
    </>
  );
}
