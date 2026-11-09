const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});
export const formatINR = (amount) => inr.format(Number(amount) || 0);
export const roleLabel = (role) =>
  ({ buyer: 'Buyer', vendor: 'Vendor', delivery_agent: 'Delivery Agent', admin: 'Admin' })[role] ||
  role;
export const statusLabel = (s) =>
  ({
    active: 'Active',
    pending_approval: 'Pending approval',
    rejected: 'Rejected',
    suspended: 'Suspended',
    deactivated: 'Deactivated',
    deleted: 'Deleted',
  })[s] || s;

export const formatDate = (iso, opts = { day: 'numeric', month: 'short' }) =>
  iso
    ? new Date(`${iso.length === 10 ? iso : iso.slice(0, 10)}T00:00:00`).toLocaleDateString(
        'en-IN',
        opts,
      )
    : '';
export const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';

export const ORDER_STATUS = {
  pending_payment: 'Awaiting payment',
  payment_failed: 'Payment failed',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};
export const SHIPMENT_STATUS = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Order confirmed',
  packing: 'Being packed',
  packed: 'Packed',
  pickup_requested: 'Waiting for pickup',
  assigned: 'Pickup assigned',
  picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed_delivery: 'Delivery attempt failed',
  returning: 'Returning to seller',
  returned: 'Returned',
  cancelled: 'Cancelled',
};
export const PAYMENT_STATUS = {
  pending: 'Payment pending',
  successful: 'Paid',
  failed: 'Payment failed',
  cancelled: 'Cancelled',
  cod_pending: 'Pay on delivery',
  cod_collected: 'Paid (collected)',
  refund_pending: 'Refund pending',
  refunded: 'Refunded',
  partially_refunded: 'Partly refunded',
};
export const statusTone = (s) =>
  ({
    confirmed: 'success',
    completed: 'success',
    delivered: 'success',
    successful: 'success',
    refunded: 'secondary',
    cancelled: 'secondary',
    pending_payment: 'warning',
    pending: 'warning',
    refund_pending: 'warning',
    payment_failed: 'danger',
    failed: 'danger',
    failed_delivery: 'danger',
  })[s] || 'info';
export const etaText = (e) => {
  if (!e?.earliest) return '';
  const f = (d) => formatDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
  return e.earliest === e.latest ? f(e.earliest) : `${f(e.earliest)} – ${f(e.latest)}`;
};

export function mediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  // Convert any stale localhost upload URLs to the active API base URL
  if (url.startsWith('http://localhost:5000/uploads/')) {
    const rel = url.slice('http://localhost:5000'.length);
    const envApi = import.meta.env.VITE_API_URL?.trim() || import.meta.env.VITE_DEV_API?.trim() || '';
    const origin = envApi.replace(/\/+api\/?$/, '').replace(/\/+$/, '');
    return origin ? `${origin}${rel}` : rel;
  }
  return url;
}
