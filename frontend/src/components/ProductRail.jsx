import { useRef } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import ProductCard from './ProductCard.jsx';
import { CardSkeleton } from './states.jsx';

export default function ProductRail({ title, items, loading, to, id }) {
  const ref = useRef(null);
  if (!loading && !items?.length) return null;
  const scroll = (dir) =>
    ref.current?.scrollBy({
      left: dir * ref.current.clientWidth * 0.85,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  const heading = `${id}-h`;
  return (
    <section className="vp-rail" aria-labelledby={heading}>
      <header className="vp-rail-head">
        <h2 id={heading} className="vp-rail-title">
          {title}
        </h2>
        {to && (
          <Link to={to} className="vp-rail-all">
            See all
          </Link>
        )}
        <span className="vp-rail-ctl">
          <button type="button" aria-label={`Scroll ${title} left`} onClick={() => scroll(-1)}>
            <FiChevronLeft aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Scroll ${title} right`} onClick={() => scroll(1)}>
            <FiChevronRight aria-hidden="true" />
          </button>
        </span>
      </header>
      <div className="vp-rail-track" ref={ref} tabIndex={0} aria-label={`${title} products`}>
        {loading
          ? Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)
          : items.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}
