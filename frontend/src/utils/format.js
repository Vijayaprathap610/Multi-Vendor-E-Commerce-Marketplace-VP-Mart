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
