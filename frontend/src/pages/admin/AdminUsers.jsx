import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import Pagination from '../../components/Pagination.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { StatusBadge, TableWrap } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { normalizeError } from '../../services/api.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime, roleLabel } from '../../utils/format.js';

const NEXT = {
  active: [['suspended', 'Suspend', 'outline-danger']],
  pending_approval: [
    ['active', 'Approve', 'dark'],
    ['rejected', 'Reject', 'outline-danger'],
  ],
  suspended: [['active', 'Reinstate', 'dark']],
  rejected: [['active', 'Reinstate', 'dark']],
  deactivated: [['active', 'Reactivate', 'dark']],
};

export default function AdminUsers() {
  const [role, setRole] = useState('delivery_agent');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const dq = useDebounce(q, 300);
  const list = useAsync(
    () =>
      adminService.users({
        role: role || undefined,
        status: status || undefined,
        q: dq || undefined,
        page,
        limit: 20,
      }),
    [role, status, dq, page],
  );
  async function act(u, s) {
    setError('');
    try {
      await adminService.setUserStatus(u.id, s);
      list.reload();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  }
  const d = list.data;
  return (
    <>
      <h1 className="vp-dash-h1">Users</h1>
      <p className="text-secondary small">
        Buyer details shown here are limited to what account management needs. Vendors have their
        own review screen.
      </p>
      <div className="vp-filters-row">
        <Form.Control
          type="search"
          aria-label="Search users"
          placeholder="Search name or email"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Form.Select
          aria-label="Filter by role"
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All roles</option>
          <option value="buyer">Buyers</option>
          <option value="delivery_agent">Delivery agents</option>
          <option value="vendor">Vendors</option>
          <option value="admin">Admins</option>
        </Form.Select>
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
          <option value="pending_approval">Pending approval</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
          <option value="deactivated">Deactivated</option>
          <option value="deleted">Deleted</option>
        </Form.Select>
      </div>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
      {list.loading && !d && <Skeleton style={{ width: '100%', height: 140 }} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {d?.items.length === 0 && <EmptyState title="No users match" />}
      {d?.items.length > 0 && (
        <TableWrap>
          <table className="table vp-table align-middle">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Joined</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    <small className="d-block text-secondary">{u.email}</small>
                  </td>
                  <td>{roleLabel(u.role)}</td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td>{formatDateTime(u.createdAt)}</td>
                  <td className="text-nowrap">
                    {u.role !== 'admin' &&
                      (NEXT[u.status] || []).map(([s, label, v]) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={v}
                          className="me-1"
                          onClick={() => act(u, s)}
                        >
                          {label}
                        </Button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {d && <Pagination page={d.page} pages={d.pages} onChange={setPage} />}
    </>
  );
}
