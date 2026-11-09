import { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { FiTrash2 } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/states.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useSeo } from '../hooks/useSeo.js';
import { normalizeError } from '../services/api.js';
import { formatPaise } from '../utils/money.js';

import { api } from '../services/api.js';

const ISSUE_TEXT = {
  OUT_OF_STOCK: 'This item is out of stock',
  INSUFFICIENT_STOCK: 'Not enough stock for this quantity',
  UNAVAILABLE: 'This item is no longer available',
};

export function CartSummary({ totals, shipments, hasIssues, onCouponApplied }) {
  const inclusive = totals.taxMode !== 'exclusive';
  const [couponCode, setCouponCode] = useState('');
  const [couponMsg, setCouponMsg] = useState(null);
  const [busyCoupon, setBusyCoupon] = useState(false);

  const applyCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setBusyCoupon(true);
    setCouponMsg(null);
    try {
      const res = await api.post('/cart/coupon', { code: couponCode.trim().toUpperCase() });
      setCouponMsg({ type: 'success', text: `Coupon '${couponCode.trim().toUpperCase()}' applied!` });
      setCouponCode('');
      if (onCouponApplied) onCouponApplied();
    } catch (err) {
      setCouponMsg({ type: 'danger', text: normalizeError(err).message });
    } finally {
      setBusyCoupon(false);
    }
  };

  const removeCoupon = async () => {
    setBusyCoupon(true);
    try {
      await api.delete('/cart/coupon');
      setCouponMsg({ type: 'info', text: 'Coupon removed' });
      if (onCouponApplied) onCouponApplied();
    } catch (err) {
      setCouponMsg({ type: 'danger', text: normalizeError(err).message });
    } finally {
      setBusyCoupon(false);
    }
  };

  return (
    <aside className="vp-summary" aria-label="Order summary">
      <h2 className="h5">Order summary</h2>

      <div className="mb-3 p-3 bg-light rounded border">
        <Form onSubmit={applyCoupon}>
          <Form.Label className="small font-weight-bold text-dark">Have a Coupon?</Form.Label>
          <div className="d-flex gap-2">
            <Form.Control
              size="sm"
              placeholder="e.g. SAVE10"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              disabled={busyCoupon}
            />
            <Button size="sm" variant="outline-dark" type="submit" disabled={busyCoupon || !couponCode.trim()}>
              Apply
            </Button>
          </div>
        </Form>
        {couponMsg && (
          <Alert variant={couponMsg.type} className="mt-2 py-1 px-2 small mb-0">
            {couponMsg.text}
          </Alert>
        )}
        {totals.discountPaise > 0 && (
          <div className="mt-2 d-flex justify-content-between align-items-center">
            <span className="badge bg-success">Coupon Applied</span>
            <Button size="sm" variant="link" className="text-danger p-0 text-decoration-none small" onClick={removeCoupon}>
              Remove
            </Button>
          </div>
        )}
      </div>

      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatPaise(totals.subtotalPaise, { fixed: true })}</dd>
        </div>
        {totals.discountPaise > 0 && (
          <div>
            <dt>Coupon Discount</dt>
            <dd>−{formatPaise(totals.discountPaise, { fixed: true })}</dd>
          </div>
        )}
        {shipments.map((s) => (
          <div key={s.vendorId}>
            <dt>Shipping · {s.vendorName}</dt>
            <dd>{s.shippingPaise ? formatPaise(s.shippingPaise, { fixed: true }) : 'Free'}</dd>
          </div>
        ))}
        {!inclusive && (
          <div>
            <dt>GST</dt>
            <dd>{formatPaise(totals.taxPaise, { fixed: true })}</dd>
          </div>
        )}
        <div className="vp-total">
          <dt>Total</dt>
          <dd>{formatPaise(totals.totalPaise, { fixed: true })}</dd>
        </div>
      </dl>
      {inclusive && (
        <p className="small text-secondary">
          Includes {formatPaise(totals.taxPaise, { fixed: true })} of GST.
        </p>
      )}
      {hasIssues && (
        <Alert variant="warning" className="py-2 small">
          Resolve the highlighted items before checkout.
        </Alert>
      )}
      {hasIssues ? (
        <>
          <Button
            variant="dark"
            size="lg"
            className="w-100"
            disabled
            aria-describedby="checkout-note"
          >
            Proceed to checkout
          </Button>
          <p id="checkout-note" className="small text-secondary mt-2 mb-0">
            Checkout is not available yet. Your cart is saved.
          </p>
        </>
      ) : (
        <Link to="/checkout" role="button" className="btn btn-dark btn-lg w-100">
          Proceed to checkout
        </Link>
      )}
    </aside>
  );
}

export default function Cart() {
  useSeo({
    title: 'Your cart',
    description: 'Review the items in your VP Mart cart.',
    path: '/cart',
    noindex: true,
  });
  const { cart, loading, setQuantity, remove } = useCart();
  const [error, setError] = useState('');
  const run = async (fn) => {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(normalizeError(err).message);
    }
  };
  if (!cart.lines.length) {
    return (
      <div className="container py-4">
        <EmptyState
          title={loading ? 'Loading your cart…' : 'Your cart is empty'}
          action={
            <Link to="/" className="btn btn-dark">
              Start shopping
            </Link>
          }
        >
          Add products to your cart and they will appear here.
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="container-xl py-4 vp-cart">
      <h1 className="vp-h1-page">Shopping cart</h1>
      {error && (
        <Alert variant="danger" role="alert">
          {error}
        </Alert>
      )}
      <div className="vp-cart-body">
        <ul className="vp-lines">
          {cart.lines.map((l) => (
            <li key={l.listingId} className={`vp-line ${l.available ? '' : 'is-bad'}`}>
              <div className="vp-line-img">
                {l.image ? (
                  <img src={l.image} alt="" width="96" height="96" loading="lazy" />
                ) : (
                  <span aria-hidden="true">{l.title[0]}</span>
                )}
              </div>
              <div className="vp-line-main">
                {l.slug ? (
                  <Link to={`/product/${l.listingId}/${l.slug}`} className="vp-line-title">
                    {l.title}
                  </Link>
                ) : (
                  <span className="vp-line-title">{l.title}</span>
                )}
                {l.vendor && (
                  <small className="text-secondary d-block">Sold by {l.vendor.name}</small>
                )}
                {l.issues.map((i) => (
                  <p key={i} className="text-danger small mb-1" role="alert">
                    {ISSUE_TEXT[i] || i}
                    {l.maxQuantity > 0 && i === 'INSUFFICIENT_STOCK' && ` (max ${l.maxQuantity})`}
                  </p>
                ))}
                <div className="vp-line-actions">
                  {l.maxQuantity > 0 && (
                    <>
                      <Form.Label htmlFor={`q-${l.listingId}`} className="visually-hidden">
                        Quantity for {l.title}
                      </Form.Label>
                      <Form.Select
                        id={`q-${l.listingId}`}
                        size="sm"
                        value={Math.min(l.quantity, l.maxQuantity)}
                        onChange={(e) =>
                          run(() => setQuantity(l.listingId, Number(e.target.value)))
                        }
                        className="vp-qty-sm"
                      >
                        {Array.from({ length: l.maxQuantity }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </Form.Select>
                    </>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="text-danger"
                    onClick={() => run(() => remove(l.listingId))}
                    aria-label={`Remove ${l.title} from cart`}
                  >
                    <FiTrash2 aria-hidden="true" /> Remove
                  </Button>
                </div>
              </div>
              <div className="vp-line-price">
                {l.available ? (
                  <>
                    <strong>{formatPaise(l.linePaise, { fixed: true })}</strong>
                    {l.quantity > 1 && (
                      <small className="d-block text-secondary">
                        {formatPaise(l.unitPaise)} each
                      </small>
                    )}
                  </>
                ) : (
                  <span className="text-secondary">—</span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <CartSummary totals={cart.totals} shipments={cart.shipments} hasIssues={cart.hasIssues} />
      </div>
    </div>
  );
}
