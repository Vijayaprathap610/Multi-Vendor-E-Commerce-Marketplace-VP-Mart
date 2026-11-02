import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AddressForm from '../components/AddressForm.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/states.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAsync } from '../hooks/useAsync.js';
import { useSeo } from '../hooks/useSeo.js';
import { normalizeError } from '../services/api.js';
import { catalogService } from '../services/catalogService.js';
import { addressService, orderService } from '../services/orderService.js';
import { etaText } from '../utils/format.js';
import { formatPaise } from '../utils/money.js';
import { loadRazorpay } from '../utils/razorpay.js';

export default function Checkout() {
  useSeo({ title: 'Checkout', description: 'Complete your VP Mart order.', noindex: true });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useCart();
  const buyNow = useMemo(() => {
    const id = params.get('buy');
    return id
      ? { listingId: id, quantity: Math.min(20, Math.max(1, Number(params.get('qty')) || 1)) }
      : undefined;
  }, [params]);

  const addresses = useAsync(() => addressService.list(), []);
  const config = useAsync(() => catalogService.config(), []);
  const [addressId, setAddressId] = useState('');
  const [adding, setAdding] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState(undefined);
  const [method, setMethod] = useState('cod');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // an online order awaiting payment
  const confirmed = useRef(false);

  useEffect(() => {
    if (!addressId && addresses.data?.length)
      setAddressId((addresses.data.find((a) => a.isDefault) || addresses.data[0]).id);
  }, [addresses.data, addressId]);

  const preview = useAsync(
    () =>
      addressId || !addresses.loading
        ? orderService.preview({ addressId: addressId || undefined, couponCode, buyNow })
        : Promise.resolve(null),
    [addressId, couponCode, JSON.stringify(buyNow), addresses.loading],
  );
  const p = preview.data;
  const online = (config.data?.paymentMethods || []).includes('online');
  const blocked = p?.delivery?.blocked ? Object.entries(p.delivery.blocked) : [];
  const addressLabel = (a) => `${a.name}, ${a.line1}, ${a.city} ${a.pincode}`;

  async function applyCoupon(e) {
    e.preventDefault();
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponCode(code);
  }

  const finishOnline = useCallback(
    async (orderId, response) => {
      try {
        await orderService.verifyPayment({
          orderId,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
        confirmed.current = true;
        await refresh();
        navigate(`/orders/${orderId}?placed=1`, { replace: true });
      } catch (err) {
        setError(normalizeError(err));
        setPending(
          (x) =>
            x && {
              ...x,
              verifying: false,
              notice:
                'We could not verify the payment. If money was deducted it will be refunded automatically.',
            },
        );
      }
    },
    [navigate, refresh],
  );

  const openPayment = useCallback(
    async (info) => {
      setError(null);
      try {
        const Razorpay = await loadRazorpay();
        const rz = new Razorpay({
          key: info.razorpay.keyId,
          amount: info.razorpay.amountPaise,
          currency: info.razorpay.currency,
          name: info.razorpay.name,
          description: info.razorpay.description,
          order_id: info.razorpay.orderId,
          handler: (response) => {
            setPending((x) => x && { ...x, verifying: true });
            finishOnline(info.orderId, response);
          },
          modal: {
            ondismiss: () =>
              !confirmed.current &&
              setPending(
                (x) =>
                  x && {
                    ...x,
                    notice: 'The payment window was closed before the payment finished.',
                  },
              ),
          },
        });
        rz.on?.('payment.failed', async (resp) => {
          await orderService.paymentFailed(info.orderId, resp?.error?.description).catch(() => {});
          setPending(
            (x) =>
              x && {
                ...x,
                failed: true,
                notice: resp?.error?.description || 'The payment failed.',
              },
          );
        });
        rz.open();
      } catch (err) {
        setError({ message: err.message });
      }
    },
    [finishOnline],
  );

  async function place() {
    setError(null);
    if (!addressId) return setError({ message: 'Choose a delivery address first.' });
    setPlacing(true);
    try {
      const body = {
        addressId,
        paymentMethod: method,
        ...(couponCode ? { couponCode } : {}),
        ...(buyNow ? { buyNow } : {}),
      };
      const r = await orderService.checkout(body);
      if (method === 'cod') {
        await refresh();
        navigate(`/orders/${r.order.id}?placed=1`, { replace: true });
      } else {
        const info = {
          orderId: r.order.id,
          orderNumber: r.order.orderNumber,
          razorpay: r.payment.razorpay,
        };
        setPending(info);
        openPayment(info);
      }
    } catch (err) {
      setError(normalizeError(err));
      preview.reload();
    } finally {
      setPlacing(false);
    }
  }

  async function cancelPending() {
    try {
      await orderService.cancel(pending.orderId, 'Payment not completed');
      setPending(null);
      preview.reload();
    } catch (err) {
      setError(normalizeError(err));
    }
  }

  if (addresses.error) return <ErrorState error={addresses.error} onRetry={addresses.reload} />;
  if (preview.error?.code === 'CART_EMPTY') {
    return (
      <EmptyState
        title="Your cart is empty"
        action={
          <Link to="/" className="btn btn-dark">
            Continue shopping
          </Link>
        }
      >
        Add something to your cart before checking out.
      </EmptyState>
    );
  }
  const lines = p?.lines || [];
  const issues = lines.filter((l) => !l.available);

  return (
    <div className="vp-checkout">
      <h1 className="vp-h1-page">Checkout</h1>
      {pending && (
        <Alert
          variant={pending.failed ? 'danger' : 'warning'}
          role="alert"
          className="vp-pay-banner"
        >
          <strong>Order {pending.orderNumber} is waiting for payment.</strong>
          <p className="mb-2">
            {pending.verifying
              ? 'Verifying your payment…'
              : pending.notice ||
                'Complete the payment to confirm your order. Unpaid orders are released after a short time.'}
          </p>
          {!pending.verifying && (
            <div className="d-flex gap-2 flex-wrap">
              {!pending.failed && (
                <Button variant="dark" size="sm" onClick={() => openPayment(pending)}>
                  Pay now
                </Button>
              )}
              <Button variant="outline-secondary" size="sm" onClick={cancelPending}>
                Cancel this order
              </Button>
            </div>
          )}
        </Alert>
      )}
      {error && !pending && (
        <Alert variant="danger" role="alert">
          <strong className="d-block">{error.message}</strong>
          {error.fields && Object.keys(error.fields).length > 0 && (
            <ul className="mb-0 mt-1">
              {Object.entries(error.fields).map(([k, v]) => (
                <li key={k}>
                  {k}: {String(v).replaceAll('_', ' ').toLowerCase()}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      <div className="vp-checkout-grid">
        <div>
          <section className="vp-co-card" aria-labelledby="co-addr">
            <h2 id="co-addr" className="h5">
              1. Delivery address
            </h2>
            {addresses.loading && <Skeleton style={{ width: '100%', height: 80 }} />}
            {addresses.data && !adding && (
              <>
                {addresses.data.length === 0 && (
                  <p className="text-secondary">
                    Add the address where you want this order delivered.
                  </p>
                )}
                <ul className="vp-addr-list" role="radiogroup" aria-label="Delivery address">
                  {addresses.data.map((a) => (
                    <li key={a.id}>
                      <label className={`vp-addr ${addressId === a.id ? 'is-on' : ''}`}>
                        <input
                          type="radio"
                          name="address"
                          value={a.id}
                          checked={addressId === a.id}
                          onChange={() => setAddressId(a.id)}
                        />
                        <span>
                          <strong>{a.name}</strong>
                          {a.label && <em> · {a.label}</em>}
                          <br />
                          {addressLabel(a)}
                          <br />
                          <small>Phone {a.phone}</small>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <Button variant="outline-dark" size="sm" onClick={() => setAdding(true)}>
                  + Add a new address
                </Button>
              </>
            )}
            {adding && (
              <AddressForm
                idPrefix="co"
                onCancel={() => setAdding(false)}
                onSave={async (payload) => {
                  const a = await addressService.create(payload);
                  await addresses.reload();
                  setAddressId(a.id);
                  setAdding(false);
                }}
              />
            )}
          </section>

          <section className="vp-co-card" aria-labelledby="co-items">
            <h2 id="co-items" className="h5">
              2. Items and delivery
            </h2>
            {preview.loading && !p && <Skeleton style={{ width: '100%', height: 120 }} />}
            {preview.error && preview.error.code !== 'CART_EMPTY' && (
              <ErrorState error={preview.error} onRetry={preview.reload} />
            )}
            {p && (
              <>
                {issues.length > 0 && (
                  <Alert variant="warning" role="alert">
                    Some items are unavailable: {issues.map((l) => l.title).join(', ')}.{' '}
                    <Link to="/cart">Review your cart</Link>
                  </Alert>
                )}
                {blocked.length > 0 && (
                  <Alert variant="danger" role="alert">
                    <strong>Not deliverable to this address:</strong>
                    <ul className="mb-0">
                      {blocked.map(([t, m]) => (
                        <li key={t}>
                          {t}: {m}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}
                {p.shipments.map((s) => (
                  <div key={s.vendorId} className="vp-shipment">
                    <div className="d-flex justify-content-between flex-wrap gap-1">
                      <strong>Shipment from {s.vendorName}</strong>
                      {s.estimate && (
                        <span className="text-secondary">Arrives {etaText(s.estimate)}</span>
                      )}
                    </div>
                    <ul className="vp-mini-lines">
                      {lines
                        .filter((l) => l.available && l.vendor.id === s.vendorId)
                        .map((l) => (
                          <li key={l.listingId}>
                            <span>
                              {l.title} × {l.quantity}
                            </span>
                            <span>{formatPaise(l.netPaise, { fixed: true })}</span>
                          </li>
                        ))}
                    </ul>
                    <small className="text-secondary">
                      Shipping{' '}
                      {s.shippingPaise ? formatPaise(s.shippingPaise, { fixed: true }) : 'free'}
                    </small>
                  </div>
                ))}
                {!addressId && (
                  <p className="text-secondary small mb-0">
                    Choose an address to see delivery dates.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="vp-co-card" aria-labelledby="co-pay">
            <h2 id="co-pay" className="h5">
              3. Payment
            </h2>
            <div role="radiogroup" aria-label="Payment method" className="vp-pay-options">
              <label className={`vp-addr ${method === 'cod' ? 'is-on' : ''}`}>
                <input
                  type="radio"
                  name="pay"
                  value="cod"
                  checked={method === 'cod'}
                  onChange={() => setMethod('cod')}
                />
                <span>
                  <strong>Cash on Delivery</strong>
                  <br />
                  <small>
                    Pay the delivery agent when your order arrives. Each shipment’s amount is
                    collected on delivery.
                  </small>
                </span>
              </label>
              <label
                className={`vp-addr ${method === 'online' ? 'is-on' : ''} ${online ? '' : 'is-off'}`}
              >
                <input
                  type="radio"
                  name="pay"
                  value="online"
                  checked={method === 'online'}
                  onChange={() => setMethod('online')}
                  disabled={!online}
                />
                <span>
                  <strong>Pay online</strong>
                  <br />
                  <small>
                    {online
                      ? 'Cards, UPI, netbanking and wallets through Razorpay.'
                      : 'Online payment is not available right now.'}
                  </small>
                </span>
              </label>
            </div>
          </section>
        </div>

        <aside className="vp-summary" aria-label="Order summary">
          <h2 className="h5">Order summary</h2>
          <Form onSubmit={applyCoupon} className="vp-coupon-box" noValidate>
            <Form.Label htmlFor="co-coupon" className="small mb-1">
              Have a coupon?
            </Form.Label>
            <div className="d-flex gap-2">
              <Form.Control
                id="co-coupon"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Enter code"
                autoCapitalize="characters"
              />
              <Button type="submit" variant="outline-dark">
                Apply
              </Button>
            </div>
          </Form>
          {p?.coupon && (
            <p
              className={`small mt-2 ${p.coupon.valid ? 'text-success' : 'text-danger'}`}
              role={p.coupon.valid ? 'status' : 'alert'}
            >
              {p.coupon.valid ? (
                <>
                  Coupon <strong>{p.coupon.code}</strong> applied: you save{' '}
                  {formatPaise(p.coupon.discountPaise, { fixed: true })}.{' '}
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0"
                    onClick={() => {
                      setCouponCode('');
                      setCouponInput('');
                    }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                p.coupon.message
              )}
            </p>
          )}
          {p && (
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPaise(p.totals.subtotalPaise, { fixed: true })}</dd>
              </div>
              {p.totals.discountPaise > 0 && (
                <div>
                  <dt>Discount</dt>
                  <dd>−{formatPaise(p.totals.discountPaise, { fixed: true })}</dd>
                </div>
              )}
              <div>
                <dt>Shipping</dt>
                <dd>
                  {p.totals.shippingPaise
                    ? formatPaise(p.totals.shippingPaise, { fixed: true })
                    : 'Free'}
                </dd>
              </div>
              {p.totals.taxMode === 'exclusive' && (
                <div>
                  <dt>GST</dt>
                  <dd>{formatPaise(p.totals.taxPaise, { fixed: true })}</dd>
                </div>
              )}
              <div className="vp-total">
                <dt>Order total</dt>
                <dd>{formatPaise(p.totals.totalPaise, { fixed: true })}</dd>
              </div>
            </dl>
          )}
          {p && p.totals.taxMode !== 'exclusive' && (
            <p className="small text-secondary">
              Includes {formatPaise(p.totals.taxPaise, { fixed: true })} of GST.
            </p>
          )}
          <Button
            variant="dark"
            size="lg"
            className="w-100"
            disabled={placing || !p || p.hasIssues || blocked.length > 0 || !addressId || !!pending}
            onClick={place}
          >
            {placing ? 'Placing order…' : method === 'cod' ? 'Place order' : 'Continue to payment'}
          </Button>
          <p className="small text-secondary mt-2 mb-0">
            The amount you are charged is calculated on our servers from current prices.
          </p>
        </aside>
      </div>
    </div>
  );
}
