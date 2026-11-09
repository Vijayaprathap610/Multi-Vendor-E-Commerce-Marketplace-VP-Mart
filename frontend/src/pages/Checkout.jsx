import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AddressForm from '../components/AddressForm.jsx';
import RazorpayModal from '../components/RazorpayModal.jsx';
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
  const { cart, loading: cartLoading, refresh } = useCart();
  const buyNow = useMemo(() => {
    const id = params.get('buy') || params.get('listingId');
    return id
      ? { listingId: id, quantity: Math.min(20, Math.max(1, Number(params.get('qty')) || 1)) }
      : undefined;
  }, [params]);

  const addresses = useAsync(() => addressService.list(), []);
  const _config = useAsync(() => catalogService.config(), []);
  const sampleListing = useAsync(() => catalogService.search({ limit: 1 }), []);
  const sampleProduct = sampleListing.data?.items?.[0];

  const [addressId, setAddressId] = useState('');
  const [adding, setAdding] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [couponCode, setCouponCode] = useState(undefined);
  const [method, setMethod] = useState('online');
  const [paymentSubtype, setPaymentSubtype] = useState('upi'); // 'upi', 'card', 'netbanking', 'wallet', 'cod'
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // an online order awaiting payment
  const [showDummyGateway, setShowDummyGateway] = useState(false);
  const [gatewayInfo, setGatewayInfo] = useState(null);
  const confirmed = useRef(false);

  async function useQuickAddress() {
    try {
      const a = await addressService.create({
        name: 'VP Mart Customer',
        phone: '9876543210',
        line1: '12 Lake View Road, Anna Nagar',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
        isDefault: true,
      });
      await addresses.reload();
      setAddressId(a.id);
      setAdding(false);
    } catch (err) {
      setError(normalizeError(err));
    }
  }

  useEffect(() => {
    if (!addressId && addresses.data?.length)
      setAddressId((addresses.data.find((a) => a.isDefault) || addresses.data[0]).id);
  }, [addresses.data, addressId]);

  const preview = useAsync(
    () => {
      if (!buyNow && !cartLoading && (!cart?.lines || cart.lines.length === 0)) {
        return Promise.resolve({ empty: true, lines: [], totals: { totalPaise: 0 } });
      }
      return addressId || !addresses.loading
        ? orderService.preview({ addressId: addressId || undefined, couponCode, buyNow })
        : Promise.resolve(null);
    },
    [addressId, couponCode, JSON.stringify(buyNow), addresses.loading, cartLoading, cart?.lines?.length],
  );
  const p = preview.data;
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
      // If simulated dummy gateway or keys not configured, open the Razorpay-inspired modal
      if (
        info.razorpay?.isDummy ||
        !info.razorpay?.keyId ||
        info.razorpay.keyId.startsWith('rzp_test_dummy')
      ) {
        setGatewayInfo(info);
        setShowDummyGateway(true);
        return;
      }

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
      } catch {
        // Fallback to simulated gateway
        setGatewayInfo(info);
        setShowDummyGateway(true);
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
  if (
    preview.error?.code === 'CART_EMPTY' ||
    p?.empty ||
    (!buyNow && !cartLoading && (!cart?.lines || cart.lines.length === 0))
  ) {
    return (
      <EmptyState
        title="Your cart is empty"
        action={
          <div className="d-flex gap-2 justify-content-center flex-wrap">
            {sampleProduct && (
              <Button
                variant="primary"
                onClick={() => navigate(`/checkout?buy=${sampleProduct.id}&qty=1`)}
              >
                ⚡ Quick Test: Buy “{sampleProduct.title.slice(0, 26)}…”
              </Button>
            )}
            <Link to="/" className="btn btn-outline-dark">
              Continue shopping
            </Link>
          </div>
        }
      >
        Add items to your cart or click “Quick Test” to test the Razorpay payment gateway immediately.
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
                  <div className="p-3 bg-light rounded border mb-3">
                    <p className="text-secondary small mb-2">
                      No delivery address saved yet. Select an option below to continue:
                    </p>
                    <div className="d-flex gap-2 flex-wrap">
                      <Button variant="primary" size="sm" onClick={useQuickAddress}>
                        ⚡ Use Quick Test Address (Chennai 600001)
                      </Button>
                      <Button variant="outline-dark" size="sm" onClick={() => setAdding(true)}>
                        + Add Custom Address
                      </Button>
                    </div>
                  </div>
                )}
                {addresses.data.length > 0 && (
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
                )}
                {addresses.data.length > 0 && (
                  <Button variant="outline-dark" size="sm" onClick={() => setAdding(true)}>
                    + Add a new address
                  </Button>
                )}
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
              3. Payment Options
            </h2>
            <div role="radiogroup" aria-label="Payment method" className="vp-pay-options">
              {/* Option 1: UPI / QR */}
              <label
                className={`vp-pay-tile ${method === 'online' && paymentSubtype === 'upi' ? 'is-selected' : ''}`}
                onClick={() => {
                  setMethod('online');
                  setPaymentSubtype('upi');
                }}
              >
                <div className="d-flex align-items-start gap-3">
                  <input
                    type="radio"
                    name="pay-method"
                    value="upi"
                    checked={method === 'online' && paymentSubtype === 'upi'}
                    onChange={() => {
                      setMethod('online');
                      setPaymentSubtype('upi');
                    }}
                    className="mt-1"
                  />
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <strong className="vp-pay-title">📱 UPI / QR Code</strong>
                      <span className="badge bg-success-subtle text-success border border-success-subtle">
                        Instant · Zero Fee
                      </span>
                    </div>
                    <p className="text-secondary small mb-2 mt-1">
                      Google Pay, PhonePe, Paytm, BHIM or Scan &amp; Pay QR Code.
                    </p>

                    {method === 'online' && paymentSubtype === 'upi' && (
                      <div className="vp-pay-subbox p-3 mt-2">
                        <div className="d-flex gap-2 flex-wrap mb-2">
                          <span className="vp-pay-badge-btn">
                            <span className="text-primary font-weight-bold">G</span> Google Pay
                          </span>
                          <span className="vp-pay-badge-btn">
                            <span style={{ color: '#5f259f', fontWeight: 'bold' }}>P</span> PhonePe
                          </span>
                          <span className="vp-pay-badge-btn">
                            <span style={{ color: '#00baf2', fontWeight: 'bold' }}>₹</span> Paytm UPI
                          </span>
                          <span className="vp-pay-badge-btn">
                            <span style={{ color: '#00796b', fontWeight: 'bold' }}>B</span> BHIM
                          </span>
                          <span className="vp-pay-badge-btn">📷 Scan QR Code</span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center pt-1">
                          <small className="text-muted">
                            Fast UPI apps or QR code payment in Razorpay sandbox.
                          </small>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={
                              placing ||
                              !p ||
                              p.hasIssues ||
                              blocked.length > 0 ||
                              !addressId ||
                              !!pending
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              place();
                            }}
                          >
                            Pay via UPI
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </label>

              {/* Option 2: Credit / Debit Card */}
              <label
                className={`vp-pay-tile ${method === 'online' && paymentSubtype === 'card' ? 'is-selected' : ''}`}
                onClick={() => {
                  setMethod('online');
                  setPaymentSubtype('card');
                }}
              >
                <div className="d-flex align-items-start gap-3">
                  <input
                    type="radio"
                    name="pay-method"
                    value="card"
                    checked={method === 'online' && paymentSubtype === 'card'}
                    onChange={() => {
                      setMethod('online');
                      setPaymentSubtype('card');
                    }}
                    className="mt-1"
                  />
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <strong className="vp-pay-title">💳 Credit / Debit Card</strong>
                      <span className="badge bg-light text-dark border">All Major Cards</span>
                    </div>
                    <p className="text-secondary small mb-2 mt-1">
                      Visa, MasterCard, RuPay, Maestro &amp; American Express.
                    </p>

                    {method === 'online' && paymentSubtype === 'card' && (
                      <div className="vp-pay-subbox p-3 mt-2">
                        <div className="d-flex gap-2 flex-wrap mb-2">
                          <span className="vp-pay-badge-btn">💳 Visa</span>
                          <span className="vp-pay-badge-btn">💳 MasterCard</span>
                          <span className="vp-pay-badge-btn">💳 RuPay</span>
                          <span className="vp-pay-badge-btn">🔒 256-bit SSL Encrypted</span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center pt-1">
                          <small className="text-muted">
                            One-click test card autofill available in the gateway modal.
                          </small>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={
                              placing ||
                              !p ||
                              p.hasIssues ||
                              blocked.length > 0 ||
                              !addressId ||
                              !!pending
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              place();
                            }}
                          >
                            Pay via Card
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </label>

              {/* Option 3: Net Banking */}
              <label
                className={`vp-pay-tile ${method === 'online' && paymentSubtype === 'netbanking' ? 'is-selected' : ''}`}
                onClick={() => {
                  setMethod('online');
                  setPaymentSubtype('netbanking');
                }}
              >
                <div className="d-flex align-items-start gap-3">
                  <input
                    type="radio"
                    name="pay-method"
                    value="netbanking"
                    checked={method === 'online' && paymentSubtype === 'netbanking'}
                    onChange={() => {
                      setMethod('online');
                      setPaymentSubtype('netbanking');
                    }}
                    className="mt-1"
                  />
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <strong className="vp-pay-title">🏦 Net Banking</strong>
                      <span className="badge bg-light text-dark border">50+ Indian Banks</span>
                    </div>
                    <p className="text-secondary small mb-2 mt-1">
                      HDFC Bank, State Bank of India, ICICI Bank, Axis Bank, Kotak &amp; all major banks.
                    </p>

                    {method === 'online' && paymentSubtype === 'netbanking' && (
                      <div className="vp-pay-subbox p-3 mt-2">
                        <div className="d-flex gap-2 flex-wrap mb-2">
                          <span className="vp-pay-badge-btn">HDFC Bank</span>
                          <span className="vp-pay-badge-btn">SBI</span>
                          <span className="vp-pay-badge-btn">ICICI Bank</span>
                          <span className="vp-pay-badge-btn">Axis Bank</span>
                          <span className="vp-pay-badge-btn">Kotak Bank</span>
                          <span className="vp-pay-badge-btn">PNB</span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center pt-1">
                          <small className="text-muted">
                            Direct simulation of instant bank authentication.
                          </small>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={
                              placing ||
                              !p ||
                              p.hasIssues ||
                              blocked.length > 0 ||
                              !addressId ||
                              !!pending
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              place();
                            }}
                          >
                            Pay via Net Banking
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </label>

              {/* Option 4: Wallets */}
              <label
                className={`vp-pay-tile ${method === 'online' && paymentSubtype === 'wallet' ? 'is-selected' : ''}`}
                onClick={() => {
                  setMethod('online');
                  setPaymentSubtype('wallet');
                }}
              >
                <div className="d-flex align-items-start gap-3">
                  <input
                    type="radio"
                    name="pay-method"
                    value="wallet"
                    checked={method === 'online' && paymentSubtype === 'wallet'}
                    onChange={() => {
                      setMethod('online');
                      setPaymentSubtype('wallet');
                    }}
                    className="mt-1"
                  />
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <strong className="vp-pay-title">👛 Wallets</strong>
                      <span className="badge bg-light text-dark border">One-Click Pay</span>
                    </div>
                    <p className="text-secondary small mb-2 mt-1">
                      Paytm Wallet, PhonePe Wallet, Amazon Pay, MobiKwik, Airtel Money.
                    </p>

                    {method === 'online' && paymentSubtype === 'wallet' && (
                      <div className="vp-pay-subbox p-3 mt-2">
                        <div className="d-flex gap-2 flex-wrap mb-2">
                          <span className="vp-pay-badge-btn">Paytm Wallet</span>
                          <span className="vp-pay-badge-btn">PhonePe Wallet</span>
                          <span className="vp-pay-badge-btn">Amazon Pay</span>
                          <span className="vp-pay-badge-btn">MobiKwik</span>
                        </div>
                        <div className="d-flex justify-content-between align-items-center pt-1">
                          <small className="text-muted">
                            Fast checkout with supported digital wallets.
                          </small>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={
                              placing ||
                              !p ||
                              p.hasIssues ||
                              blocked.length > 0 ||
                              !addressId ||
                              !!pending
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              place();
                            }}
                          >
                            Pay via Wallet
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </label>

              {/* Option 5: Cash on Delivery */}
              <label
                className={`vp-pay-tile ${method === 'cod' ? 'is-selected' : ''}`}
                onClick={() => {
                  setMethod('cod');
                  setPaymentSubtype('cod');
                }}
              >
                <div className="d-flex align-items-start gap-3">
                  <input
                    type="radio"
                    name="pay-method"
                    value="cod"
                    checked={method === 'cod'}
                    onChange={() => {
                      setMethod('cod');
                      setPaymentSubtype('cod');
                    }}
                    className="mt-1"
                  />
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <strong className="vp-pay-title">💵 Cash on Delivery (COD)</strong>
                      <span className="badge bg-light text-dark border">Doorstep Payment</span>
                    </div>
                    <p className="text-secondary small mb-0 mt-1">
                      Pay cash or UPI to the delivery executive when your package arrives.
                    </p>
                  </div>
                </div>
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
            variant={method === 'online' ? 'primary' : 'dark'}
            size="lg"
            className="w-100 font-weight-bold"
            disabled={placing || !p || p.hasIssues || blocked.length > 0 || !addressId || !!pending}
            onClick={place}
          >
            {placing
              ? 'Opening Gateway…'
              : method === 'online'
                ? `Proceed to Pay via ${
                    paymentSubtype === 'upi'
                      ? 'UPI / QR'
                      : paymentSubtype === 'card'
                        ? 'Card'
                        : paymentSubtype === 'netbanking'
                          ? 'Net Banking'
                          : 'Wallet'
                  } (${formatPaise(p?.totals?.totalPaise || 0, { fixed: true })})`
                : 'Place Order (Cash on Delivery)'}
          </Button>
          {!addressId && addresses.data?.length === 0 && (
            <p className="small text-danger text-center mt-2 mb-0">
              ⚠️ Add or select a delivery address in Step 1 to continue.
            </p>
          )}
          <p className="small text-secondary mt-2 mb-0">
            The amount you are charged is calculated on our servers from current prices.
          </p>
        </aside>
      </div>

      {showDummyGateway && (
        <RazorpayModal
          show={showDummyGateway}
          info={gatewayInfo || pending}
          initialTab={paymentSubtype}
          onSuccess={async (response) => {
            setShowDummyGateway(false);
            setPending((x) => x && { ...x, verifying: true });
            await finishOnline((gatewayInfo || pending).orderId, response);
          }}
          onFailure={async (reason) => {
            const current = gatewayInfo || pending;
            if (current) {
              await orderService.paymentFailed(current.orderId, reason).catch(() => {});
              setPending((x) => x && { ...x, failed: true, notice: reason });
            }
          }}
          onClose={() => {
            setShowDummyGateway(false);
            if (!confirmed.current) {
              setPending((x) => x && {
                ...x,
                notice: 'The payment window was closed before the payment finished.',
              });
            }
          }}
        />
      )}
    </div>
  );
}
