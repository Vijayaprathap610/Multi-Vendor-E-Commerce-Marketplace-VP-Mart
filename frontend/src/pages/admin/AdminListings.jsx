import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import Pagination from '../../components/Pagination.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { Stat, StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatPaise } from '../../utils/money.js';

export default function AdminListings() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const [hide, setHide] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [couponTarget, setCouponTarget] = useState(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState(null);
  const [couponForm, setCouponForm] = useState({
    discountType: 'percent',
    value: 10,
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    codePrefix: 'PROMO',
    title: '',
  });
  const dq = useDebounce(q, 300);
  const list = useAsync(
    () =>
      adminService.listings({
        q: dq || undefined,
        status: status || undefined,
        stock: stock || undefined,
        page,
      }),
    [dq, status, stock, page],
  );
  const d = list.data;

  async function moderate(item, action, why) {
    setError('');
    try {
      await adminService.moderate(item.id, action, why);
      setHide(null);
      setReason('');
      list.reload();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  }
  return (
    <>
      <h1 className="vp-dash-h1">Listings</h1>
      {d && (
        <div className="vp-stats">
          <Stat label="Vendor listings" value={d.metrics.listings} />
          <Stat label="Unique products" value={d.metrics.uniqueProducts} />
          <Stat label="Units in stock" value={d.metrics.stockUnits} />
          <Stat label="Units sold" value={d.metrics.unitsSold} />
          <Stat label="Out of stock" value={d.metrics.outOfStock} />
        </div>
      )}
      <p className="text-secondary small">
        Figures reflect the current filters. A product sold by several vendors counts once under
        unique products and once per vendor under listings.
      </p>
      <div className="vp-filters-row">
        <Form.Control
          type="search"
          aria-label="Search listings"
          placeholder="Search title, SKU, vendor or brand"
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
          <option value="active">Active</option>
          <option value="inactive">Stopped by vendor</option>
          <option value="hidden">Hidden</option>
        </Form.Select>
        <Form.Select
          aria-label="Filter by stock"
          value={stock}
          onChange={(e) => {
            setStock(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Any stock</option>
          <option value="out">Out of stock</option>
        </Form.Select>
      </div>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
      {list.loading && !d && <Skeleton style={{ width: '100%', height: 160 }} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {d?.items.length === 0 && <EmptyState title="No listings match" />}
      {d?.items.length > 0 && (
        <TableWrap>
          <table className="table vp-table align-middle">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Vendor</th>
                <th scope="col" className="text-end">
                  Price
                </th>
                <th scope="col" className="text-end">
                  Stock
                </th>
                <th scope="col" className="text-end">
                  Sold
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="vp-cell-prod">
                      {l.image ? (
                        <img src={l.image} alt="" width="40" height="40" />
                      ) : (
                        <span className="vp-cell-ph" aria-hidden="true" />
                      )}
                      <span>
                        {l.title}
                        <small className="d-block text-secondary">
                          {l.sku} · {l.category}
                        </small>
                      </span>
                    </span>
                  </td>
                  <td>{l.vendorName}</td>
                  <td className="text-end">{formatPaise(l.pricePaise)}</td>
                  <td className="text-end">
                    {l.stock}
                    {l.outOfStock && <small className="d-block text-danger">out</small>}
                  </td>
                  <td className="text-end">{l.soldCount}</td>
                  <td>
                    <StatusBadge status={l.status} />
                    {l.hiddenReason && (
                      <small className="d-block text-secondary">{l.hiddenReason}</small>
                    )}
                  </td>
                  <td className="text-nowrap">
                    {l.productId && (
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        className="me-1"
                        onClick={() => {
                          setCouponTarget(l);
                          setCouponMsg(null);
                        }}
                      >
                        Coupon
                      </Button>
                    )}
                    {l.status === 'hidden' ? (
                      <Button size="sm" variant="dark" onClick={() => moderate(l, 'unhide')}>
                        Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline-danger" onClick={() => setHide(l)}>
                        Hide
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {d && <Pagination page={d.page} pages={d.pages} onChange={setPage} />}
      <Modal show={!!hide} onHide={() => setHide(null)} centered scrollable className="vp-modal-scrollable">
        <Form
          className="vp-modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length >= 3) moderate(hide, 'hide', reason.trim());
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title as="h2" className="h5">
              Hide this listing?
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p className="text-secondary mb-3">
              “{hide?.title}” will be removed from the public shop. The vendor is told it was hidden
              and cannot restore it. The record stays for orders and audit.
            </p>
            <Form.Group controlId="why">
              <Form.Label>Reason (shown to the vendor)</Form.Label>
              <Form.Control
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={300}
                autoFocus
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setHide(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" disabled={reason.trim().length < 3}>
              Hide listing
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={!!couponTarget} onHide={() => setCouponTarget(null)} centered scrollable size="md" className="vp-modal-scrollable">
        <Form
          className="vp-modal-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setCouponBusy(true);
            setCouponMsg(null);
            try {
              await adminService.createProductCoupon(couponTarget.productId, {
                title: couponForm.title || `Special on ${couponTarget.title}`,
                discountType: couponForm.discountType,
                value: Number(couponForm.value),
                validFrom: new Date(couponForm.validFrom),
                validTo: new Date(couponForm.validTo),
                codePrefix: couponForm.codePrefix.toUpperCase(),
                productIds: [couponTarget.productId],
              });
              setCouponMsg({ type: 'success', text: 'Product coupon created successfully!' });
              setTimeout(() => setCouponTarget(null), 1200);
            } catch (err) {
              setCouponMsg({ type: 'danger', text: normalizeError(err).message });
            } finally {
              setCouponBusy(false);
            }
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title as="h2" className="h5">
              Create Coupon for “{couponTarget?.title}”
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {couponMsg && (
              <Alert variant={couponMsg.type} className="py-2 small mb-3">
                {couponMsg.text}
              </Alert>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Coupon Title</Form.Label>
              <Form.Control
                placeholder={`Promo for ${couponTarget?.title}`}
                value={couponForm.title}
                onChange={(e) => setCouponForm({ ...couponForm, title: e.target.value })}
              />
            </Form.Group>
            <div className="row g-3 mb-3">
              <div className="col-12 col-md-6">
                <Form.Label>Discount Type</Form.Label>
                <Form.Select
                  value={couponForm.discountType}
                  onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value })}
                >
                  <option value="percent">Percent (%)</option>
                  <option value="fixed">Fixed (₹)</option>
                </Form.Select>
              </div>
              <div className="col-12 col-md-6">
                <Form.Label>Discount Value</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  max={couponForm.discountType === 'percent' ? 100 : 100000}
                  value={couponForm.value}
                  onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })}
                />
              </div>
            </div>
            <div className="row g-3 mb-3">
              <div className="col-12 col-md-6">
                <Form.Label>Valid From</Form.Label>
                <Form.Control
                  type="date"
                  value={couponForm.validFrom}
                  onChange={(e) => setCouponForm({ ...couponForm, validFrom: e.target.value })}
                />
              </div>
              <div className="col-12 col-md-6">
                <Form.Label>Valid To</Form.Label>
                <Form.Control
                  type="date"
                  value={couponForm.validTo}
                  onChange={(e) => setCouponForm({ ...couponForm, validTo: e.target.value })}
                />
              </div>
            </div>
            <Form.Group className="mb-2">
              <Form.Label>Code Prefix</Form.Label>
              <Form.Control
                value={couponForm.codePrefix}
                maxLength={10}
                onChange={(e) => setCouponForm({ ...couponForm, codePrefix: e.target.value.toUpperCase() })}
              />
              <Form.Text className="text-secondary">E.g., PROMO → generates code like PROMO-ABC12</Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setCouponTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" disabled={couponBusy}>
              {couponBusy ? 'Creating…' : 'Create Coupon'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
}
