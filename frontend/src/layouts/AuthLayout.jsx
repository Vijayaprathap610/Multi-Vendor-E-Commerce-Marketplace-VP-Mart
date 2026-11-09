import { useEffect, useRef } from 'react';
import { FiCreditCard, FiShield, FiShoppingBag, FiTruck, FiZap } from 'react-icons/fi';
import Logo from '../components/Logo.jsx';

/* ─── Animated Stat Counter with JSDOM safe fallback ─────────────────── */
function AnimatedCounter({ target, suffix = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      el.textContent = `${target}${suffix}`;
      return;
    }

    let start = null;
    const duration = 1600;
    const step = (timestamp) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (progress < 1) requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          requestAnimationFrame(step);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, suffix]);

  return <span ref={ref}>{target}{suffix}</span>;
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="vp-auth">
      {/* ── Left: Form Panel ── */}
      <main className="vp-auth-main">
        <Logo size="lg" />
        <h1 className="vp-auth-title">{title}</h1>
        {subtitle && <p className="vp-auth-sub">{subtitle}</p>}
        <div className="vp-auth-card">{children}</div>
        {footer && <div className="vp-auth-foot">{footer}</div>}
      </main>

      {/* ── Right: Animated Brand Experience ── */}
      <aside className="vp-auth-aside" aria-hidden="true">
        {/* Dynamic Glowing Aurora Spheres */}
        <div className="vp-auth-bg-glow vp-glow-1" />
        <div className="vp-auth-bg-glow vp-glow-2" />
        <div className="vp-auth-bg-glow vp-glow-3" />
        <div className="vp-auth-bg-glow vp-glow-4" />
        <div className="vp-auth-grid-pattern" />

        {/* Orbit Rings */}
        <div className="vp-orbit-wrap">
          <div className="vp-orbit-ring ring-1" />
          <div className="vp-orbit-ring ring-2" />
          <div className="vp-orbit-ring ring-3" />
        </div>

        {/* Top: Status Pill */}
        <div className="vp-auth-aside-top">
          <div className="vp-auth-pill">
            <span className="vp-pulse-dot" />
            <span className="vp-pill-text">VP Mart Unified Ecosystem</span>
            <span className="vp-pill-badge">LIVE</span>
          </div>
        </div>

        {/* Center: Prominent Brand Logo & Animations */}
        <div className="vp-auth-hero-center">
          <div className="vp-auth-brand-badge-box">
            <div className="vp-auth-hero-logo">
              <span className="vp-hero-v">V</span>
              <span className="vp-hero-p">P</span>
              <span className="vp-hero-mart">Mart</span>
              <div className="vp-hero-bag-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    d="M6 8h12l1 12H5L6 8Z"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9 8V6.5a3 3 0 0 1 6 0V8"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <p className="vp-auth-hero-tagline">
              Multi-Vendor Marketplace &amp; Smart Delivery Platform
            </p>
          </div>

          {/* Floating Animated Showcase Cards */}
          <div className="vp-auth-cards-showcase">
            <div className="vp-auth-float-card vp-float-1">
              <div className="vp-card-icon-wrap vp-icon-blue">
                <FiShoppingBag />
              </div>
              <div className="vp-card-info">
                <div className="vp-card-header">
                  <strong>40+ Verified Vendors</strong>
                  <span className="vp-mini-badge vp-badge-blue">Stores</span>
                </div>
                <small>Direct brands, wholesale &amp; local shops</small>
              </div>
            </div>

            <div className="vp-auth-float-card vp-float-2">
              <div className="vp-card-icon-wrap vp-icon-green">
                <FiTruck />
              </div>
              <div className="vp-card-info">
                <div className="vp-card-header">
                  <strong>30+ Delivery Agents</strong>
                  <span className="vp-mini-badge vp-badge-green">Hyperlocal</span>
                </div>
                <small>Real-time dispatch &amp; secure OTP verification</small>
              </div>
            </div>

            <div className="vp-auth-float-card vp-float-3">
              <div className="vp-card-icon-wrap vp-icon-purple">
                <FiCreditCard />
              </div>
              <div className="vp-card-info">
                <div className="vp-card-header">
                  <strong>Instant Razorpay &amp; COD</strong>
                  <span className="vp-mini-badge vp-badge-purple">Secured</span>
                </div>
                <small>UPI, Cards, Net Banking &amp; Cash on Delivery</small>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Typography & Metrics */}
        <div className="vp-auth-aside-bottom">
          <h2 className="vp-aside-big">
            One marketplace.<br />
            <span className="vp-gradient-text">Infinite possibilities.</span>
          </h2>
          <p className="vp-aside-small">
            Explore 18+ departments, launch your vendor storefront, or earn as a verified delivery partner.
          </p>

          <div className="vp-auth-metrics-strip">
            <div className="vp-metric-item">
              <strong><AnimatedCounter target={40} suffix="+" /></strong>
              <span>Vendors</span>
            </div>
            <div className="vp-metric-divider" />
            <div className="vp-metric-item">
              <strong><AnimatedCounter target={30} suffix="+" /></strong>
              <span>Agents</span>
            </div>
            <div className="vp-metric-divider" />
            <div className="vp-metric-item">
              <strong><AnimatedCounter target={18} suffix="+" /></strong>
              <span>Categories</span>
            </div>
            <div className="vp-metric-divider" />
            <div className="vp-metric-item">
              <strong>
                <FiShield style={{ color: '#10b981', verticalAlign: 'middle', marginRight: '4px' }} />
                100%
              </strong>
              <span>Encrypted</span>
            </div>
          </div>

          <div className="vp-trust-tags">
            <span className="vp-trust-pill"><FiZap /> Ultra-fast API</span>
            <span className="vp-trust-pill"><FiShield /> ISO/SSL Security</span>
            <span className="vp-trust-pill"><FiTruck /> Live Tracking</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
