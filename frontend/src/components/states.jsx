import { Alert, Button } from 'react-bootstrap';

export function EmptyState({ title, children, action }) {
  return (
    <div className="vp-empty" role="status">
      <h2 className="h5">{title}</h2>
      {children && <p className="text-secondary mb-3">{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <Alert variant="danger" className="vp-error" role="alert">
      <strong className="d-block mb-1">We couldn’t load this.</strong>
      <span>{error?.message || 'Something went wrong.'}</span>
      {onRetry && (
        <div className="mt-2">
          <Button size="sm" variant="outline-danger" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </Alert>
  );
}

export function Skeleton({ className = '', style }) {
  return <span className={`vp-skel ${className}`} style={style} aria-hidden="true" />;
}

export function CardSkeleton() {
  return (
    <div className="vp-card vp-card-skel" aria-hidden="true">
      <Skeleton className="vp-skel-img" />
      <Skeleton style={{ width: '90%', height: 14, marginTop: 12 }} />
      <Skeleton style={{ width: '60%', height: 12, marginTop: 8 }} />
      <Skeleton style={{ width: '40%', height: 18, marginTop: 12 }} />
    </div>
  );
}

export function GridSkeleton({ n = 8 }) {
  return (
    <div className="vp-grid" role="status" aria-label="Loading products">
      {Array.from({ length: n }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
