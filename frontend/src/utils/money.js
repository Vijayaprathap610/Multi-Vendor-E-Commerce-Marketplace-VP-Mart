// Money is integer paise end to end. These helpers convert for display and for form input
// without floating-point drift.
const fmtWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const fmtFixed = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Whole rupees print without decimals (₹1,299); anything with paise always shows two (₹1,299.50).
export const formatPaise = (paise, { fixed = false } = {}) => {
  const p = Number(paise) || 0;
  return (fixed || p % 100 !== 0 ? fmtFixed : fmtWhole).format(p / 100);
};

// "1,299.50" or "1299.5" -> 129950. Returns null for anything that is not a valid amount.
export function rupeesToPaise(input) {
  const s = String(input ?? '').replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ''] = s.split('.');
  return Number(r) * 100 + Number(p.padEnd(2, '0'));
}
export const paiseToRupeesString = (paise) =>
  paise == null ? '' : (paise / 100).toFixed(2).replace(/\.00$/, '');
export const discountPercent = (price, mrp) =>
  mrp > price ? Math.floor(((mrp - price) * 100) / mrp) : 0;
