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
      <Modal show={!!hide} onHide={() => setHide(null)} centered>
        <Form
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
            <p>
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
    </>
  );
}
