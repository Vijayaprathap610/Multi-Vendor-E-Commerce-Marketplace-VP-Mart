import { discountPercent, formatPaise } from '../utils/money.js';

export default function Price({ pricePaise, mrpPaise, size = 'md', showOff = true }) {
  const off = discountPercent(pricePaise, mrpPaise);
  return (
    <span className={`vp-price vp-price-${size}`}>
      <span className="vp-price-now">{formatPaise(pricePaise)}</span>
      {off > 0 && (
        <>
          <s className="vp-price-mrp" aria-label={`Original price ${formatPaise(mrpPaise)}`}>
            {formatPaise(mrpPaise)}
          </s>
          {showOff && <span className="vp-price-off">{off}% off</span>}
        </>
      )}
    </span>
  );
}
