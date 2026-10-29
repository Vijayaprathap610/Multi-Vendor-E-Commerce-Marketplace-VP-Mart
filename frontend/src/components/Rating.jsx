import { FaStar } from 'react-icons/fa';

export default function Rating({ value = 0, count = 0, size = 'sm', showCount = true }) {
  if (!count) return <span className="vp-rating vp-rating-none">No ratings yet</span>;
  return (
    <span
      className={`vp-rating vp-rating-${size}`}
      aria-label={`Rated ${value} out of 5 from ${count} ratings`}
    >
      <span className="vp-rating-pill">
        <FaStar aria-hidden="true" /> {Number(value).toFixed(1)}
      </span>
      {showCount && <span className="vp-rating-count">({count.toLocaleString('en-IN')})</span>}
    </span>
  );
}
