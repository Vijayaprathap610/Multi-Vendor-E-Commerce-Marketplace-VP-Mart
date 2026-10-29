import { Button } from 'react-bootstrap';
import { EmptyState, ErrorState, Skeleton } from '../../components/states.jsx';
import { StatusBadge } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { adminService } from '../../services/adminService.js';
import { formatDateTime } from '../../utils/format.js';

export default function AdminMessages() {
  const list = useAsync(() => adminService.messages(), []);
  return (
    <>
      <h1 className="vp-dash-h1">Support messages</h1>
      {list.loading && <Skeleton style={{ width: '100%', height: 140 }} />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && (
        <EmptyState title="No messages">
          Messages sent from the Contact page appear here.
        </EmptyState>
      )}
      {list.data?.length > 0 && (
        <ul className="vp-msgs">
          {list.data.map((m) => (
            <li key={m.id}>
              <div className="d-flex gap-2 align-items-center flex-wrap">
                <strong>{m.subject || '(no subject)'}</strong>
                <StatusBadge status={m.status} />
                <small className="text-secondary">
                  {m.name} · {m.email} · {formatDateTime(m.createdAt)}
                </small>
              </div>
              <p className="mb-2">{m.message}</p>
              {m.status === 'new' && (
                <Button
                  size="sm"
                  variant="outline-dark"
                  onClick={async () => {
                    await adminService.resolveMessage(m.id);
                    list.reload();
                  }}
                >
                  Mark resolved
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
