import { Link } from 'react-router-dom';

// Original mark: red V, blue P, black "Mart", plus a small shopping-bag glyph.
export default function Logo({ size = 'md', to = '/', className = '' }) {
  return (
    <Link to={to} className={`vp-logo vp-logo-${size} ${className}`}>
      {/* Real text (not aria-label) so the accessible name matches what sighted users read. */}
      <span className="visually-hidden">VP Mart home</span>
      <span className="vp-logo-v" aria-hidden="true">
        V
      </span>
      <span className="vp-logo-p" aria-hidden="true">
        P
      </span>
      <span className="vp-logo-mart" aria-hidden="true">
        Mart
      </span>
      <svg className="vp-logo-bag" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M6 8h12l1 12H5L6 8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          d="M9 8V6.5a3 3 0 0 1 6 0V8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </Link>
  );
}
