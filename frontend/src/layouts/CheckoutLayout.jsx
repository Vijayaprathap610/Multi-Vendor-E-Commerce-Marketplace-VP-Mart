import { FiLock } from 'react-icons/fi';
import { Outlet } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

// Simplified, distraction-free layout: no category bar or footer links while paying.
export default function CheckoutLayout() {
  return (
    <div className="vp-checkout-shell">
      <a href="#main" className="vp-skip">
        Skip to main content
      </a>
      <header className="vp-checkout-top">
        <Logo />
        <span className="vp-secure">
          <FiLock aria-hidden="true" /> Secure checkout
        </span>
      </header>
      <main id="main" tabIndex={-1} className="vp-checkout-main">
        <Outlet />
      </main>
    </div>
  );
}
