import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';

export default function AdminBrands() {
  const list = useAsync(() => adminService.brands(), []);
  const [name, setName] = useState('');
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');
  async function run(fn) {
    setError('');
    try {
      await fn();
      setName('');
      setEdit(null);
      list.reload();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  }
  return (
    <>
      <h1 className="vp-dash-h1">Brands</h1>
      <Form
        className="d-flex gap-2 mb-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) run(() => adminService.createBrand({ name: name.trim() }));
        }}
      >
        <Form.Control
          aria-label="New brand name"
          placeholder="New brand name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <Button type="submit" variant="dark" disabled={name.trim().length < 2}>
          Add brand
        </Button>
      </Form>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
      {list.loading && <Skeleton style={{ width: '100%', height: 140 }} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data && (
        <TableWrap>
          <table className="table vp-table align-middle">
            <thead>
              <tr>
                <th scope="col">Brand</th>
                <th scope="col">Listings</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((b) => (
                <tr key={b.id}>
                  <td>
                    {edit?.id === b.id ? (
                      <Form
                        className="d-flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          run(() => adminService.updateBrand(b.id, { name: edit.name.trim() }));
                        }}
                      >
                        <Form.Control
                          size="sm"
                          aria-label="Brand name"
                          value={edit.name}
                          onChange={(e) => setEdit({ id: b.id, name: e.target.value })}
                        />
                        <Button type="submit" size="sm" variant="dark">
                          Save
                        </Button>
                        <Button size="sm" variant="outline-secondary" onClick={() => setEdit(null)}>
                          Cancel
                        </Button>
                      </Form>
                    ) : (
                      b.name
                    )}
                  </td>
                  <td>{b.listingCount}</td>
                  <td>
                    <StatusBadge status={b.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td className="text-nowrap">
                    <Button
                      size="sm"
                      variant="outline-dark"
                      className="me-1"
                      onClick={() => setEdit({ id: b.id, name: b.name })}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant={b.isActive ? 'outline-danger' : 'dark'}
                      onClick={() =>
                        run(() => adminService.updateBrand(b.id, { isActive: !b.isActive }))
                      }
                    >
                      {b.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </>
  );
}
