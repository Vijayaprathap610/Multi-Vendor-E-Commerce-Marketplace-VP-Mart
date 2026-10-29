import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import Pagination from '../../components/Pagination.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { ConfirmModal, StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { normalizeError } from '../../services/api.js';
import { vendorService } from '../../services/vendorService.js';
import { formatPaise } from '../../utils/money.js';

function StockCell({ item, onSaved, onError }) {
  const [v, setV] = useState(String(item.stock));
  const [busy, setBusy] = useState(false);
  const dirty = v !== String(item.stock);
  async function save() {
    if (!/^\d+$/.test(v)) return onError('Stock must be a whole number');
    setBusy(true);
    try {
      await vendorService.update(item.id, { stock: Number(v) });
      onSaved();
    } catch (err) {
      onError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className="vp-stock-edit">
      <Form.Control
        size="sm"
        aria-label={`Stock for ${item.title}`}
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value)}
      />
      {dirty && (
        <Button size="sm" variant="dark" disabled={busy} onClick={save}>
          Save
        </Button>
      )}
    </span>
  );
}

export default function VendorProducts() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const dq = useDebounce(q, 300);
  const list = useAsync(
    () =>
      vendorService.listings({
        q: dq || undefined,
        status: status || undefined,
        stock: stock || undefined,
        page,
      }),
    [dq, status, stock, page],
  );

  async function toggle(item, to) {
    setError('');
    try {
      await (to === 'inactive'
        ? vendorService.stopSelling(item.id)
        : vendorService.update(item.id, { status: 'active' }));
      setConfirm(null);
      list.reload();
    } catch (err) {
      setConfirm(null);
      setError(normalizeError(err).message);
    }
  }
  const d = list.data;
  return (
    <>
      <div className="vp-dash-bar">
        <h1 className="vp-dash-h1 mb-0">Products</h1>
        <Link to="/vendor/products/new" className="btn btn-dark">
          Add product
        </Link>
      </div>
      <div className="vp-filters-row">
        <Form.Control
          type="search"
          aria-label="Search your products"
          placeholder="Search by name"
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
          <option value="inactive">Stopped selling</option>
          <option value="hidden">Hidden by admin</option>
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
      {d && d.items.length === 0 && (
        <EmptyState
          title="No products found"
          action={
            <Link to="/vendor/products/new" className="btn btn-dark">
              Add your first product
            </Link>
          }
        >
          Products you list will appear here.
        </EmptyState>
      )}
      {d?.items.length > 0 && (
        <TableWrap>
          <table className="table vp-table align-middle">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">SKU</th>
                <th scope="col" className="text-end">
                  Price
                </th>
                <th scope="col">Stock</th>
                <th scope="col">Sold</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <span className="vp-cell-prod">
                      {it.images[0] ? (
                        <img
                          src={it.images[0].thumbUrl || it.images[0].url}
                          alt=""
                          width="40"
                          height="40"
                        />
                      ) : (
                        <span className="vp-cell-ph" aria-hidden="true" />
                      )}
                      <span>
                        {it.title}
                        <small className="d-block text-secondary">{it.categoryName}</small>
                      </span>
                    </span>
                  </td>
                  <td>{it.sku}</td>
                  <td className="text-end">
                    {formatPaise(it.pricePaise)}
                    {it.mrpPaise > it.pricePaise && (
                      <small className="d-block text-secondary">
                        <s>{formatPaise(it.mrpPaise)}</s>
                      </small>
                    )}
                  </td>
                  <td>
                    <StockCell
                      key={`${it.id}-${it.stock}`}
                      item={it}
                      onSaved={list.reload}
                      onError={setError}
                    />
                    {it.outOfStock && <small className="text-danger d-block">Out of stock</small>}
                  </td>
                  <td>{it.soldCount}</td>
                  <td>
                    <StatusBadge status={it.status} />
                    {it.status === 'hidden' && it.hiddenReason && (
                      <small className="d-block text-secondary">{it.hiddenReason}</small>
                    )}
                  </td>
                  <td className="text-nowrap">
                    <Link
                      to={`/vendor/products/${it.id}`}
                      className="btn btn-sm btn-outline-dark me-1"
                    >
                      Edit
                    </Link>
                    {it.status === 'active' && (
                      <Button size="sm" variant="outline-danger" onClick={() => setConfirm(it)}>
                        Stop selling
                      </Button>
                    )}
                    {it.status === 'inactive' && (
                      <Button size="sm" variant="outline-dark" onClick={() => toggle(it, 'active')}>
                        Resume
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
      <ConfirmModal
        show={!!confirm}
        title="Stop selling this product?"
        confirmLabel="Stop selling"
        danger
        onCancel={() => setConfirm(null)}
        onConfirm={() => toggle(confirm, 'inactive')}
      >
        “{confirm?.title}” will disappear from the shop. Past orders and payment records are kept,
        and you can resume selling at any time.
      </ConfirmModal>
    </>
  );
}
