import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { FiMapPin, FiTruck, FiStar } from 'react-icons/fi';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import Price from '../components/Price.jsx';
import ProductRail from '../components/ProductRail.jsx';
import Rating from '../components/Rating.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/states.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { isValidPincode, useLocationPin } from '../context/LocationContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { normalizeError } from '../services/api.js';
import { catalogService } from '../services/catalogService.js';
import { reviewService } from '../services/marketplaceService.js';
import { formatDate, formatDateTime } from '../utils/format.js';
import { formatPaise } from '../utils/money.js';

function Delivery({ delivery, pincode, openPicker }) {
  if (!pincode) {
    return (
      <button type="button" className="vp-delivery-cta" onClick={openPicker}>
        <FiMapPin aria-hidden="true" /> Enter your PIN code to see the delivery date
      </button>
    );
  }
  if (!delivery) return <Skeleton style={{ width: 260, height: 18 }} />;
  if (!delivery.serviceable) {
    return (
      <p className="vp-delivery vp-delivery-no" role="status">
        <FiTruck aria-hidden="true" />{' '}
        <span>
          {delivery.message || 'Not deliverable to this PIN code'}{' '}
          <button type="button" className="btn btn-link p-0 align-baseline" onClick={openPicker}>
            Change PIN
          </button>
        </span>
      </p>
    );
  }
  const range =
    delivery.earliest === delivery.latest
      ? formatDate(delivery.earliest, { weekday: 'short', day: 'numeric', month: 'short' })
      : `${formatDate(delivery.earliest, { weekday: 'short', day: 'numeric', month: 'short' })} – ${formatDate(delivery.latest, { weekday: 'short', day: 'numeric', month: 'short' })}`;
  return (
    <p className="vp-delivery" role="status">
      <FiTruck aria-hidden="true" />{' '}
      <span>
        Delivery to <strong>{pincode}</strong> by <strong>{range}</strong>.{' '}
        {delivery.shippingChargePaise
          ? `Shipping ${formatPaise(delivery.shippingChargePaise)}${delivery.freeShippingAbovePaise ? `, free above ${formatPaise(delivery.freeShippingAbovePaise)}` : ''}.`
          : 'Free shipping.'}{' '}
        <button type="button" className="btn btn-link p-0 align-baseline" onClick={openPicker}>
          Change
        </button>
      </span>
    </p>
  );
}

function Reviews({ id, summary }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState(null);
  const [formSuccess, setFormSuccess] = useState(false);

  const reviews = useAsync(() => catalogService.reviews(id, page), [id, page]);
  const d = reviews.data;
  const total = d ? Object.values(d.distribution).reduce((a, b) => a + b, 0) : 0;

  async function submitReview(e) {
    e.preventDefault();
    setSubmitting(true);
    setFormErr(null);
    try {
      await reviewService.create({
        listingId: id,
        rating: Number(rating),
        title: title.trim(),
        body: body.trim(),
      });
      setFormSuccess(true);
      setShowModal(false);
      reviews.reload();
    } catch (err) {
      setFormErr(normalizeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="reviews-h" className="vp-section">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2 id="reviews-h" className="h5 mb-0">
          Ratings &amp; reviews
        </h2>
        {user?.role === 'buyer' && (
          <Button variant="outline-dark" size="sm" onClick={() => { setShowModal(true); setFormErr(null); setFormSuccess(false); }}>
            <FiStar className="me-1" /> Write a review
          </Button>
        )}
      </div>

      {formSuccess && (
        <Alert variant="success" dismissible onClose={() => setFormSuccess(false)}>
          Thank you! Your review has been submitted.
        </Alert>
      )}

      {reviews.error && <ErrorState error={reviews.error} onRetry={reviews.reload} />}
      {d && total === 0 && (
        <p className="text-secondary">
          No reviews yet. Buyers can review a product after purchasing it.
        </p>
      )}
      {d && total > 0 && (
        <div className="vp-reviews">
          <div className="vp-dist">
            <p className="mb-2">
              <strong className="fs-3">{summary.ratingAvg.toFixed(1)}</strong>{' '}
              <span className="text-secondary">out of 5 · {summary.ratingCount} ratings</span>
            </p>
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} className="vp-dist-row">
                <span>{s} star</span>
                <span
                  className="vp-bar"
                  role="img"
                  aria-label={`${s} star: ${d.distribution[s]} of ${total} reviews`}
                >
                  <i style={{ width: `${total ? (d.distribution[s] / total) * 100 : 0}%` }} />
                </span>
                <span>{d.distribution[s]}</span>
              </div>
            ))}
          </div>
          <ul className="vp-review-list">
            {d.items.map((r) => (
              <li key={r.id}>
                <Rating value={r.rating} count={1} showCount={false} />
                {r.title && <strong className="d-block">{r.title}</strong>}
                {r.body && <p className="mb-1">{r.body}</p>}
                <small className="text-secondary">
                  {r.reviewer} · {formatDateTime(r.createdAt)}
                </small>
              </li>
            ))}
            {d.pages > 1 && (
              <li className="d-flex gap-2">
                <Button
                  size="sm"
                  variant="outline-dark"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Newer
                </Button>
                <Button
                  size="sm"
                  variant="outline-dark"
                  disabled={page >= d.pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Older
                </Button>
              </li>
            )}
          </ul>
        </div>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title as="h2" className="h5">Write a Review</Modal.Title>
        </Modal.Header>
        <Form onSubmit={submitReview}>
          <Modal.Body>
            {formErr && <Alert variant="danger" className="py-2 small">{formErr.message}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Rating</Form.Label>
              <Form.Select value={rating} onChange={(e) => setRating(e.target.value)}>
                <option value={5}>5 stars — Excellent</option>
                <option value={4}>4 stars — Good</option>
                <option value={3}>3 stars — Average</option>
                <option value={2}>2 stars — Poor</option>
                <option value={1}>1 star — Terrible</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Headline</Form.Label>
              <Form.Control
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's most important to know?"
                maxLength={100}
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>Review</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What did you like or dislike?"
                maxLength={1000}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="dark" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Review'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </section>
  );
}

export default function Product() {
  const { id } = useParams();
  const { pincode, openPicker } = useLocationPin();
  const { user } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const detail = useAsync(
    () => catalogService.listing(id, isValidPincode(pincode) ? pincode : undefined),
    [id, pincode],
  );
  const related = useAsync(() => catalogService.related(id).catch(() => []), [id]);
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setImg(0);
    setQty(1);
    setMsg(null);
  }, [id]);

  const l = detail.data?.listing;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  useSeo({
    title: l?.title,
    description: l
      ? (l.description || `${l.title} sold by ${l.vendor.name}`).slice(0, 160)
      : undefined,
    path: l ? `/product/${l.id}/${l.slug}` : undefined,
    image: l?.images?.[0]?.url,
    jsonLd: l && {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: l.title,
      description: l.description,
      image: l.images.map((i) => i.url),
      ...(l.brand ? { brand: { '@type': 'Brand', name: l.brand.name } } : {}),
      ...(l.ratingCount
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: l.ratingAvg,
              reviewCount: l.ratingCount,
            },
          }
        : {}),
      offers: {
        '@type': 'Offer',
        url: `${origin}/product/${l.id}/${l.slug}`,
        priceCurrency: 'INR',
        price: (l.pricePaise / 100).toFixed(2),
        availability: l.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: l.vendor.name },
      },
    },
  });

  if (detail.loading && !l)
    return (
      <div className="container-xl py-4">
        <Skeleton style={{ width: '100%', height: 420 }} />
      </div>
    );
  if (detail.error?.code === 'NOT_FOUND')
    return (
      <EmptyState
        title="This product isn’t available"
        action={
          <Link to="/" className="btn btn-dark">
            Keep shopping
          </Link>
        }
      >
        It may have been removed, sold out for good, or the link is wrong.
      </EmptyState>
    );
  if (detail.error)
    return (
      <div className="container-xl py-4">
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </div>
    );

  const max = Math.min(20, l.stockLeft || 20);
  async function addToCart() {
    setMsg(null);
    if (!user) return navigate('/login', { state: { from: location.pathname } });
    if (user.role !== 'buyer' && user.role !== 'admin')
      return setMsg({
        v: 'warning',
        t: 'Only buyer accounts can purchase. Sign in with a buyer account to shop.',
      });
    setBusy(true);
    try {
      await cart.add(l.id, qty);
      setMsg({ v: 'success', t: `Added ${qty} to your cart.`, cart: true });
    } catch (err) {
      setMsg({ v: 'danger', t: normalizeError(err).message });
    } finally {
      setBusy(false);
    }
  }
  const attrs = Object.entries(l.attributes || {});

  return (
    <div className="container-xl vp-product">
      <nav aria-label="Breadcrumb" className="vp-crumbs">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link to={`/c/${l.category.slug}`}>{l.category.name}</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{l.title}</span>
      </nav>
      <div className="vp-pdp">
        <div className="vp-gallery">
          <div className="vp-gallery-main">
            {l.images.length ? (
              <img src={l.images[img].url} alt={l.images[img].alt} width="800" height="800" />
            ) : (
              <span className="vp-card-ph" aria-hidden="true">
                {l.title[0]}
              </span>
            )}
          </div>
          {l.images.length > 1 && (
            <ul className="vp-thumbs" aria-label="Product images">
              {l.images.map((im, i) => (
                <li key={im.url}>
                  <button
                    type="button"
                    className={i === img ? 'on' : ''}
                    onClick={() => setImg(i)}
                    aria-label={`Show image ${i + 1}`}
                    aria-current={i === img}
                  >
                    <img src={im.thumbUrl || im.url} alt="" width="72" height="72" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="vp-buybox">
          {l.brand && (
            <Link to={`/search?brand=${l.brand.slug}`} className="vp-brand-link">
              {l.brand.name}
            </Link>
          )}
          <h1 className="vp-pdp-title">{l.title}</h1>
          <Rating value={l.ratingAvg} count={l.ratingCount} size="md" />
          <div className="vp-pdp-price">
            <Price pricePaise={l.pricePaise} mrpPaise={l.mrpPaise} size="lg" />
          </div>
          <p className="text-secondary small mb-3">
            {l.taxMode === 'inclusive'
              ? `Inclusive of ${l.gstPercent}% GST.`
              : `Plus ${l.gstPercent}% GST at checkout.`}
          </p>
          <p className={`vp-stock ${l.inStock ? 'in' : 'out'}`}>
            {l.inStock
              ? l.stockLeft
                ? `Only ${l.stockLeft} left in stock`
                : 'In stock'
              : 'Currently unavailable'}
          </p>
          {l.prescriptionRequired && (
            <Alert variant="info" className="py-2 small">
              A valid prescription is required for this medicine.
            </Alert>
          )}
          <Delivery delivery={detail.data.delivery} pincode={pincode} openPicker={openPicker} />
          <div className="vp-buy-actions">
            <Form.Label htmlFor="qty" className="visually-hidden">
              Quantity
            </Form.Label>
            <Form.Select
              id="qty"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              disabled={!l.inStock}
              className="vp-qty"
            >
              {Array.from({ length: max }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </Form.Select>
            <Button
              variant="dark"
              size="lg"
              onClick={addToCart}
              disabled={!l.inStock || busy}
              className="flex-grow-1"
            >
              {l.inStock ? (busy ? 'Adding…' : 'Add to cart') : 'Out of stock'}
            </Button>
            {l.inStock && (
              <Button
                variant="warning"
                size="lg"
                onClick={() => {
                  if (!user) {
                    navigate('/login', { state: { from: `/checkout?buy=${l.id}&qty=${qty}` } });
                  } else if (user.role !== 'buyer' && user.role !== 'admin') {
                    setMsg({
                      v: 'warning',
                      t: 'Only buyer accounts can purchase. Sign in with a buyer account to shop.',
                    });
                  } else {
                    navigate(`/checkout?buy=${l.id}&qty=${qty}`);
                  }
                }}
                className="flex-grow-1 font-weight-bold"
              >
                Buy Now
              </Button>
            )}
          </div>
          <div aria-live="polite">
            {msg && (
              <Alert variant={msg.v} className="mt-3 py-2">
                {msg.t} {msg.cart && <Link to="/cart">View cart</Link>}
              </Alert>
            )}
          </div>
          {detail.data.vendor && (
            <aside className="vp-seller" aria-label="Seller">
              <span className="text-secondary small">Sold by</span>
              <Link to={`/shop/${detail.data.vendor.slug}`} className="vp-seller-name">
                {detail.data.vendor.logoUrl && (
                  <img src={detail.data.vendor.logoUrl} alt="" width="28" height="28" />
                )}
                {detail.data.vendor.name}
              </Link>
            </aside>
          )}
        </div>
      </div>
      {l.description && (
        <section className="vp-section" aria-labelledby="desc-h">
          <h2 id="desc-h" className="h5">
            About this item
          </h2>
          <p className="vp-desc">{l.description}</p>
        </section>
      )}
      {(attrs.length > 0 || l.expiryDate) && (
        <section className="vp-section" aria-labelledby="spec-h">
          <h2 id="spec-h" className="h5">
            Details
          </h2>
          <table className="table vp-spec">
            <tbody>
              {attrs.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
              {l.expiryDate && (
                <tr>
                  <th scope="row">Best before / expiry</th>
                  <td>
                    {formatDate(l.expiryDate, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
      <Reviews id={l.id} summary={l} />
      <ProductRail
        id="related"
        title="More like this"
        items={related.data}
        loading={related.loading}
      />
    </div>
  );
}
