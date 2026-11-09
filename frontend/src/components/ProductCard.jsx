import { useState } from 'react';
import { Link } from 'react-router-dom';
import Price from './Price.jsx';
import Rating from './Rating.jsx';
import { mediaUrl } from '../utils/format.js';

export const productPath = (p) => `/product/${p.id}/${p.slug}`;

export default function ProductCard({ product: p }) {
  const [imgError, setImgError] = useState(false);
  const initials = p.title
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <article className="vp-card">
      <Link to={productPath(p)} className="vp-card-link">
        <div className="vp-card-media">
          {p.image && !imgError ? (
            <img
              src={mediaUrl(p.image.thumbUrl || p.image.url)}
              alt={p.image.alt || p.title}
              loading="lazy"
              decoding="async"
              width="400"
              height="400"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="vp-card-ph" aria-hidden="true">
              {initials}
            </span>
          )}
          {!p.inStock && <span className="vp-badge vp-badge-out">Out of stock</span>}
          {p.prescriptionRequired && <span className="vp-badge vp-badge-rx">Rx</span>}
        </div>
        <h3 className="vp-card-title">{p.title}</h3>
      </Link>
      <div className="vp-card-body">
        <Rating value={p.ratingAvg} count={p.ratingCount} />
        <Price pricePaise={p.pricePaise} mrpPaise={p.mrpPaise} />
        <p className="vp-card-vendor">Sold by {p.vendor.name}</p>
        {p.inStock && p.stockLeft && <p className="vp-card-low">Only {p.stockLeft} left</p>}
      </div>
    </article>
  );
}
