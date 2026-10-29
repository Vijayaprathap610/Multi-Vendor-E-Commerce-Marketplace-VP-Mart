import { Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { ErrorState, Skeleton } from '../../components/states.jsx';
import { Stat, StatusBadge } from '../../components/ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { vendorService } from '../../services/vendorService.js';

const SECTION = {
  shopName: 'shop name',
  businessName: 'business name',
  pickupAddress: 'pickup address',
  payout: 'payout details',
};

export default function VendorOverview() {
  const { user } = useAuth();
  const profile = useAsync(() => vendorService.profile(), []);
  const approved = user.status === 'active';
  const summary = useAsync(
    () => (approved ? vendorService.summary() : Promise.resolve(null)),
    [approved],
  );
  const p = profile.data;
  return (
    <>
      <h1 className="vp-dash-h1">
        Overview <StatusBadge status={user.status} />
      </h1>
      {profile.error && <ErrorState error={profile.error} onRetry={profile.reload} />}
      {!approved &&
        p &&
        (p.profile?.submittedAt ? (
          <Alert variant="info">
            Your shop profile was submitted and is waiting for administrator approval. You will be
            able to list products once it is approved.
          </Alert>
        ) : (
          <Alert variant="warning">
            Complete your shop profile and submit it for approval
            {p.missing.length > 0 && (
              <> (still needed: {p.missing.map((m) => SECTION[m] || m).join(', ')})</>
            )}
            . <Link to="/vendor/profile">Open shop profile</Link>
          </Alert>
        ))}
      {approved && summary.loading && <Skeleton style={{ width: '100%', height: 90 }} />}
      {summary.data && (
        <div className="vp-stats">
          <Stat label="Listings" value={summary.data.listings} />
          <Stat label="Active" value={summary.data.active} />
          <Stat label="Out of stock" value={summary.data.outOfStock} />
          <Stat label="Units in stock" value={summary.data.stockUnits} />
          <Stat label="Units sold" value={summary.data.unitsSold} hint="From completed orders" />
          <Stat label="Hidden by admin" value={summary.data.hidden} />
        </div>
      )}
      {approved && (
        <p className="mt-4">
          <Link to="/vendor/products/new" className="btn btn-dark">
            Add a product
          </Link>
        </p>
      )}
    </>
  );
}
