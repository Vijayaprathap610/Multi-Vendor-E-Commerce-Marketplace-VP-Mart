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
