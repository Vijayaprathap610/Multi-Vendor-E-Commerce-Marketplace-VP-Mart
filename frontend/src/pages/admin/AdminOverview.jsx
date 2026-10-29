import { ErrorState, Skeleton } from '../../components/states.jsx';
import { Stat } from '../../components/ui.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { adminService } from '../../services/adminService.js';

const n = (o, k) => o?.[k] ?? 0;

export default function AdminOverview() {
  const r = useAsync(() => adminService.overview(), []);
  if (r.loading) return <Skeleton style={{ width: '100%', height: 200 }} />;
  if (r.error) return <ErrorState error={r.error} onRetry={r.reload} />;
  const { users: u, catalog: c, promotions, support } = r.data;
  const sum = (role, ...s) => s.reduce((t, k) => t + n(u[role], k), 0);
  return (
    <>
      <h1 className="vp-dash-h1">Overview</h1>
      <h2 className="vp-dash-h2">Catalogue</h2>
      <div className="vp-stats">
        <Stat label="Vendor listings" value={c.listings} hint="Offers by sellers" />
        <Stat
          label="Unique products"
          value={c.uniqueProducts}
          hint="Distinct items across sellers"
        />
        <Stat label="Units in stock" value={c.stockUnits} />
        <Stat label="Units sold" value={c.unitsSold} hint="From completed orders" />
        <Stat label="Categories" value={c.categories} />
        <Stat label="Out of stock listings" value={c.outOfStock} />
        <Stat label="Hidden listings" value={c.hidden} />
      </div>
      <h2 className="vp-dash-h2">People</h2>
      <div className="vp-stats">
        <Stat label="Vendors" value={n(u.vendor, 'total')} />
        <Stat label="Active vendors" value={n(u.vendor, 'active')} />
        <Stat label="Pending approval" value={n(u.vendor, 'pending_approval')} />
        <Stat label="Suspended vendors" value={n(u.vendor, 'suspended')} />
        <Stat label="Buyers" value={n(u.buyer, 'total')} />
        <Stat
          label="Delivery agents"
          value={n(u.delivery_agent, 'total')}
          hint={`${n(u.delivery_agent, 'pending_approval')} pending`}
        />
        <Stat
          label="Suspended accounts"
          value={['vendor', 'buyer', 'delivery_agent'].reduce(
            (t, r2) => t + sum(r2, 'suspended'),
            0,
          )}
        />
      </div>
      <h2 className="vp-dash-h2">Promotions and support</h2>
      <div className="vp-stats">
        <Stat label="Live banners" value={promotions.liveBanners} />
        <Stat label="Open messages" value={support.openMessages} />
      </div>
      <p className="text-secondary small mt-4">
        Orders, payments, commission, settlements, refunds and delivery figures appear here once
        checkout and fulfilment are enabled.
      </p>
    </>
  );
}
