// All money is stored and calculated as integer paise. No floating point anywhere in totals.
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const discountPercent = (pricePaise, mrpPaise) =>
  mrpPaise > pricePaise ? Math.floor(((mrpPaise - pricePaise) * 100) / mrpPaise) : 0;
// Integer division with round-half-up for non-negative numerators.
export const roundDiv = (num, den) => Math.floor((num * 2 + den) / (den * 2));
