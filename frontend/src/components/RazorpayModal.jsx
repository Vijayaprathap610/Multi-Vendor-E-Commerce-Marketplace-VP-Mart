import { useEffect, useState } from 'react';
import {
  FiAlertCircle,
  FiCheck,
  FiCheckCircle,
  FiCreditCard,
  FiDollarSign,
  FiGlobe,
  FiLock,
  FiShield,
  FiSmartphone,
  FiX,
} from 'react-icons/fi';
import { formatPaise } from '../utils/money.js';
import '../styles/razorpay.css';

const POPULAR_BANKS = [
  { id: 'HDFC', name: 'HDFC Bank', code: 'HDFC', color: '#004c8f' },
  { id: 'SBI', name: 'State Bank of India', code: 'SBI', color: '#280071' },
  { id: 'ICIC', name: 'ICICI Bank', code: 'ICICI', color: '#b02a30' },
  { id: 'UTIB', name: 'Axis Bank', code: 'AXIS', color: '#861f41' },
  { id: 'KKBK', name: 'Kotak Bank', code: 'KOTAK', color: '#ed1c24' },
  { id: 'PUNB', name: 'Punjab National Bank', code: 'PNB', color: '#a21d22' },
];

const OTHER_BANKS = [
  'Bank of Baroda',
  'Bank of India',
  'Canara Bank',
  'Central Bank of India',
  'Federal Bank',
  'IDBI Bank',
  'Indian Bank',
  'IndusInd Bank',
  'Punjab & Sind Bank',
  'Union Bank of India',
  'YES Bank',
];

export default function RazorpayModal({
  show,
  info,
  initialTab = 'upi',
  onSuccess,
  onFailure,
  onClose,
}) {
  const [tab, setTab] = useState(initialTab || 'upi'); // 'upi', 'card', 'netbanking', 'wallet', 'cod'
  const [simOutcome, setSimOutcome] = useState('success'); // 'success' or 'failure'
  const [stage, setStage] = useState('idle'); // 'idle', 'processing', 'success', 'failed'
  const [errorMessage, setErrorMessage] = useState('');

  // UPI State
  const [upiApp, setUpiApp] = useState('gpay');
  const [upiId, setUpiId] = useState('');
  const [showQr, setShowQr] = useState(false);

  // Card State
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');

  // Netbanking State
  const [selectedBank, setSelectedBank] = useState('HDFC');
  const [customBank, setCustomBank] = useState('');

  // Wallet State
  const [selectedWallet, setSelectedWallet] = useState('paytm');

  const amountPaise = info?.razorpay?.amountPaise || 0;
  const orderNumber = info?.orderNumber || 'VPM-ORDER';
  const orderId = info?.orderId || '';
  const providerOrderId = info?.razorpay?.orderId || `order_sim_${Date.now()}`;

  useEffect(() => {
    if (show) {
      if (initialTab) {
        setTab(initialTab);
      }
      setStage('idle');
      setErrorMessage('');
    }
  }, [show, initialTab]);

  if (!show || !info) return null;

  function autofillTestCard() {
    setCardNumber('4111 2222 3333 4444');
    setCardExpiry('12/28');
    setCardCvv('123');
    setCardName('Test Buyer');
  }

  function detectCardBrand(num) {
    const clean = num.replace(/\D/g, '');
    if (clean.startsWith('4')) return 'VISA';
    if (/^5[1-5]/.test(clean)) return 'MASTERCARD';
    if (/^(60|65|81|82)/.test(clean)) return 'RUPAY';
    return 'CARD';
  }

  async function handlePay() {
    setStage('processing');
    setErrorMessage('');

    // Simulate authentic network latency for payment gateway handshake
    await new Promise((resolve) => setTimeout(resolve, 1400));

    if (simOutcome === 'failure') {
      setStage('failed');
      setErrorMessage(
        'Transaction declined by issuing bank (Simulated Test). Please try again or use another payment method.',
      );
      if (onFailure) {
        onFailure('Payment failed in simulation: Bank declined transaction');
      }
      return;
    }

    // Payment Successful!
    const mockPaymentId = `pay_sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const mockSignature = `sim_sig_${providerOrderId}`;

    setStage('success');

    // Give the customer 1.2s to enjoy the success checkmark, then trigger confirmation
    setTimeout(() => {
      onSuccess({
        razorpay_payment_id: mockPaymentId,
        razorpay_signature: mockSignature,
      });
    }, 1200);
  }

  return (
    <div className="rzp-backdrop" role="dialog" aria-modal="true" aria-labelledby="rzp-title">
      <div className="rzp-container">
        {/* Header */}
        <div className="rzp-header">
          <div className="rzp-header-left">
            <div className="rzp-logo-badge">VP</div>
            <div>
              <h2 id="rzp-title" className="rzp-merchant-name">VP Mart Checkout</h2>
              <p className="rzp-order-ref">Order: {orderNumber}</p>
            </div>
          </div>
          <div className="rzp-header-right">
            <div>
              <div className="rzp-amount-label">Amount to Pay</div>
              <div className="rzp-amount-val">{formatPaise(amountPaise, { fixed: true })}</div>
            </div>
            <button
              type="button"
              className="rzp-close-btn"
              onClick={onClose}
              aria-label="Close payment window"
              disabled={stage === 'processing'}
            >
              <FiX />
            </button>
          </div>
        </div>

        {/* Test Mode Banner */}
        <div className="rzp-test-banner">
          <span>⚡ Simulated Razorpay Payment Gateway — Sandbox Mode</span>
          <span className="rzp-test-pill">No real money</span>
        </div>

        {/* Dynamic Body Content based on stage */}
        {stage === 'processing' && (
          <div className="rzp-state-screen" aria-live="polite">
            <div className="rzp-spinner" />
            <h3 className="h5 mb-2">Processing Payment…</h3>
            <p className="text-secondary small mb-1">
              Contacting your bank / UPI provider for {formatPaise(amountPaise, { fixed: true })}.
            </p>
            <p className="text-muted small">
              Please do not close this window or hit the back button.
            </p>
          </div>
        )}

        {stage === 'success' && (
          <div className="rzp-state-screen" aria-live="polite">
            <div className="rzp-success-badge">
              <FiCheck />
            </div>
            <h3 className="h4 text-success mb-2">Payment Successful!</h3>
            <p className="text-secondary mb-1">
              {formatPaise(amountPaise, { fixed: true })} received successfully.
            </p>
            <p className="text-muted small">
              Creating your order and redirecting to confirmation…
            </p>
          </div>
        )}

        {stage === 'failed' && (
          <div className="rzp-state-screen" aria-live="polite">
            <div className="rzp-fail-badge">
              <FiAlertCircle />
            </div>
            <h3 className="h5 text-danger mb-2">Payment Not Completed</h3>
            <p className="text-secondary small mb-3">{errorMessage}</p>
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-dark btn-sm"
                onClick={() => setStage('idle')}
              >
                Try Again
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage === 'idle' && (
          <>
            <div className="rzp-body">
              {/* Sidebar Navigation */}
              <nav className="rzp-sidebar" aria-label="Payment Options">
                <button
                  type="button"
                  className={`rzp-nav-item ${tab === 'upi' ? 'is-active' : ''}`}
                  onClick={() => setTab('upi')}
                >
                  <span className="rzp-nav-icon"><FiSmartphone /></span>
                  <div>
                    <span>UPI / QR</span>
                    <span className="rzp-nav-subtitle">GPay, PhonePe, Paytm</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`rzp-nav-item ${tab === 'card' ? 'is-active' : ''}`}
                  onClick={() => setTab('card')}
                >
                  <span className="rzp-nav-icon"><FiCreditCard /></span>
                  <div>
                    <span>Cards</span>
                    <span className="rzp-nav-subtitle">Credit &amp; Debit Cards</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`rzp-nav-item ${tab === 'netbanking' ? 'is-active' : ''}`}
                  onClick={() => setTab('netbanking')}
                >
                  <span className="rzp-nav-icon"><FiGlobe /></span>
                  <div>
                    <span>Net Banking</span>
                    <span className="rzp-nav-subtitle">All Indian Banks</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`rzp-nav-item ${tab === 'wallet' ? 'is-active' : ''}`}
                  onClick={() => setTab('wallet')}
                >
                  <span className="rzp-nav-icon"><FiDollarSign /></span>
                  <div>
                    <span>Wallets</span>
                    <span className="rzp-nav-subtitle">Paytm, PhonePe</span>
                  </div>
                </button>

                <button
                  type="button"
                  className={`rzp-nav-item ${tab === 'cod' ? 'is-active' : ''}`}
                  onClick={() => setTab('cod')}
                >
                  <span className="rzp-nav-icon"><FiShield /></span>
                  <div>
                    <span>Cash on Delivery</span>
                    <span className="rzp-nav-subtitle">Pay upon arrival</span>
                  </div>
                </button>
              </nav>

              {/* Main Panel Details */}
              <div className="rzp-main">
                {/* 1. UPI */}
                {tab === 'upi' && (
                  <div>
                    <div className="rzp-section-title">
                      <span>Select a UPI App</span>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 text-decoration-none"
                        onClick={() => setShowQr(!showQr)}
                      >
                        {showQr ? 'Hide QR' : 'Show QR Code'}
                      </button>
                    </div>

                    {showQr ? (
                      <div className="text-center p-3 border rounded mb-3 bg-light">
                        <div
                          style={{
                            width: 140,
                            height: 140,
                            margin: '0 auto 10px',
                            background: '#ffffff',
                            border: '2px solid #0c2340',
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                          }}
                        >
                          {/* Simulated SVG QR Matrix */}
                          <svg width="110" height="110" viewBox="0 0 100 100">
                            <rect width="30" height="30" x="5" y="5" fill="#0c2340" />
                            <rect width="18" height="18" x="11" y="11" fill="#ffffff" />
                            <rect width="8" height="8" x="16" y="16" fill="#0c2340" />
                            <rect width="30" height="30" x="65" y="5" fill="#0c2340" />
                            <rect width="18" height="18" x="71" y="11" fill="#ffffff" />
                            <rect width="8" height="8" x="76" y="16" fill="#0c2340" />
                            <rect width="30" height="30" x="5" y="65" fill="#0c2340" />
                            <rect width="18" height="18" x="11" y="71" fill="#ffffff" />
                            <rect width="8" height="8" x="16" y="76" fill="#0c2340" />
                            <rect width="12" height="12" x="44" y="44" fill="#2563eb" />
                            <rect width="6" height="6" x="40" y="20" fill="#0c2340" />
                            <rect width="6" height="6" x="55" y="25" fill="#0c2340" />
                            <rect width="6" height="6" x="20" y="45" fill="#0c2340" />
                            <rect width="6" height="6" x="75" y="50" fill="#0c2340" />
                            <rect width="6" height="6" x="50" y="70" fill="#0c2340" />
                            <rect width="6" height="6" x="70" y="75" fill="#0c2340" />
                          </svg>
                        </div>
                        <div className="small font-weight-bold">Scan with any UPI App</div>
                        <div className="text-muted" style={{ fontSize: '11px' }}>
                          PhonePe, Google Pay, Paytm, BHIM
                        </div>
                      </div>
                    ) : (
                      <div className="rzp-upi-apps">
                        <button
                          type="button"
                          className={`rzp-upi-btn ${upiApp === 'gpay' ? 'is-selected' : ''}`}
                          onClick={() => setUpiApp('gpay')}
                        >
                          <span className="rzp-upi-icon rzp-upi-gpay">G</span>
                          <span>Google Pay</span>
                        </button>
                        <button
                          type="button"
                          className={`rzp-upi-btn ${upiApp === 'phonepe' ? 'is-selected' : ''}`}
                          onClick={() => setUpiApp('phonepe')}
                        >
                          <span className="rzp-upi-icon rzp-upi-phonepe">P</span>
                          <span>PhonePe</span>
                        </button>
                        <button
                          type="button"
                          className={`rzp-upi-btn ${upiApp === 'paytm' ? 'is-selected' : ''}`}
                          onClick={() => setUpiApp('paytm')}
                        >
                          <span className="rzp-upi-icon rzp-upi-paytm">₹</span>
                          <span>Paytm UPI</span>
                        </button>
                        <button
                          type="button"
                          className={`rzp-upi-btn ${upiApp === 'bhim' ? 'is-selected' : ''}`}
                          onClick={() => setUpiApp('bhim')}
                        >
                          <span className="rzp-upi-icon rzp-upi-bhim">B</span>
                          <span>BHIM</span>
                        </button>
                      </div>
                    )}

                    <div className="rzp-divider-text">OR enter UPI ID</div>

                    <div className="rzp-form-group">
                      <label className="rzp-label" htmlFor="rzp-upi-input">
                        Virtual Payment Address (VPA)
                      </label>
                      <input
                        id="rzp-upi-input"
                        className="rzp-input"
                        placeholder="username@bank"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                      />
                      <div className="rzp-chips">
                        {['@okhdfcbank', '@okaxis', '@ybl', '@paytm'].map((sfx) => (
                          <button
                            key={sfx}
                            type="button"
                            className="rzp-chip"
                            onClick={() => {
                              const prefix = upiId.split('@')[0] || 'buyer';
                              setUpiId(prefix + sfx);
                            }}
                          >
                            {sfx}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Cards */}
                {tab === 'card' && (
                  <div>
                    <div className="rzp-section-title">
                      <span>Card Details</span>
                      <button
                        type="button"
                        className="rzp-autofill-btn"
                        onClick={autofillTestCard}
                      >
                        ⚡ Autofill Test Card
                      </button>
                    </div>

                    <div className="rzp-form-group">
                      <label className="rzp-label" htmlFor="rzp-card-num">
                        Card Number ({detectCardBrand(cardNumber)})
                      </label>
                      <input
                        id="rzp-card-num"
                        className="rzp-input"
                        placeholder="4111 2222 3333 4444"
                        value={cardNumber}
                        maxLength={19}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
                          setCardNumber(val);
                        }}
                      />
                    </div>

                    <div className="rzp-card-row">
                      <div className="rzp-form-group">
                        <label className="rzp-label" htmlFor="rzp-card-exp">Expiry (MM/YY)</label>
                        <input
                          id="rzp-card-exp"
                          className="rzp-input"
                          placeholder="MM/YY"
                          value={cardExpiry}
                          maxLength={5}
                          onChange={(e) => {
                            let val = e.target.value.replace(/\D/g, '');
                            if (val.length >= 2) val = `${val.slice(0, 2)}/${val.slice(2, 4)}`;
                            setCardExpiry(val);
                          }}
                        />
                      </div>
                      <div className="rzp-form-group">
                        <label className="rzp-label" htmlFor="rzp-card-cvv">CVV</label>
                        <input
                          id="rzp-card-cvv"
                          type="password"
                          className="rzp-input"
                          placeholder="123"
                          value={cardCvv}
                          maxLength={4}
                          onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                        />
                      </div>
                    </div>

                    <div className="rzp-form-group">
                      <label className="rzp-label" htmlFor="rzp-card-name">Cardholder Name</label>
                      <input
                        id="rzp-card-name"
                        className="rzp-input"
                        placeholder="Name on card"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* 3. Net Banking */}
                {tab === 'netbanking' && (
                  <div>
                    <div className="rzp-section-title">Popular Indian Banks</div>
                    <div className="rzp-banks-grid">
                      {POPULAR_BANKS.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          className={`rzp-bank-card ${selectedBank === b.id && !customBank ? 'is-selected' : ''}`}
                          onClick={() => {
                            setSelectedBank(b.id);
                            setCustomBank('');
                          }}
                        >
                          <div className="rzp-bank-logo" style={{ background: b.color }}>
                            {b.code.slice(0, 3)}
                          </div>
                          <span className="rzp-bank-name">{b.name}</span>
                        </button>
                      ))}
                    </div>

                    <div className="rzp-form-group mt-2">
                      <label className="rzp-label" htmlFor="rzp-all-banks">
                        Or select other banks
                      </label>
                      <select
                        id="rzp-all-banks"
                        className="rzp-input"
                        value={customBank}
                        onChange={(e) => setCustomBank(e.target.value)}
                      >
                        <option value="">-- Choose from all Indian banks --</option>
                        {OTHER_BANKS.map((bank) => (
                          <option key={bank} value={bank}>{bank}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* 4. Wallets */}
                {tab === 'wallet' && (
                  <div>
                    <div className="rzp-section-title">Select Wallet</div>
                    {[
                      { id: 'paytm', name: 'Paytm Wallet', desc: 'Fast 1-click checkout' },
                      { id: 'phonepe', name: 'PhonePe Wallet', desc: 'Link via registered mobile' },
                      { id: 'amazon', name: 'Amazon Pay Balance', desc: 'Pay using Amazon balance' },
                      { id: 'mobikwik', name: 'MobiKwik', desc: 'Instant wallet transfer' },
                    ].map((w) => (
                      <div
                        key={w.id}
                        className={`rzp-wallet-row ${selectedWallet === w.id ? 'is-selected' : ''}`}
                        onClick={() => setSelectedWallet(w.id)}
                      >
                        <div>
                          <strong>{w.name}</strong>
                          <div className="small text-muted">{w.desc}</div>
                        </div>
                        <input
                          type="radio"
                          name="walletOption"
                          checked={selectedWallet === w.id}
                          onChange={() => setSelectedWallet(w.id)}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* 5. Cash on Delivery (Option in modal) */}
                {tab === 'cod' && (
                  <div className="p-2">
                    <div className="rzp-section-title">Pay via Cash on Delivery</div>
                    <p className="text-secondary small">
                      You can pay via cash or UPI directly to our delivery executive when your package arrives at your doorstep.
                    </p>
                    <div className="p-3 bg-light rounded border text-muted small">
                      ✓ No advance payment required<br />
                      ✓ Exact cash or UPI scan available on delivery<br />
                      ✓ Instant receipt upon handover
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer with Simulation Toggle & Pay CTA */}
            <div className="rzp-footer">
              <div className="rzp-sim-ctrl">
                <span>⚡ Gateway Simulation:</span>
                <div className="rzp-sim-options">
                  <label className="rzp-sim-label text-success">
                    <input
                      type="radio"
                      name="simOutcome"
                      value="success"
                      checked={simOutcome === 'success'}
                      onChange={() => setSimOutcome('success')}
                    />
                    ✓ Simulate Success
                  </label>
                  <label className="rzp-sim-label text-danger">
                    <input
                      type="radio"
                      name="simOutcome"
                      value="failure"
                      checked={simOutcome === 'failure'}
                      onChange={() => setSimOutcome('failure')}
                    />
                    ✕ Simulate Bank Decline
                  </label>
                </div>
              </div>

              <button
                type="button"
                className="rzp-pay-cta"
                onClick={handlePay}
              >
                <FiLock /> Pay {formatPaise(amountPaise, { fixed: true })}
              </button>

              <p className="rzp-security-note">
                <FiShield /> 256-bit SSL Encryption · Secured by Razorpay Simulation
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
