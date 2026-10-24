import { Link, Outlet } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Minimal shell for Phase 1. The full navbar, category bar and footer arrive with the storefront.
export default function PublicLayout() {
  const { user } = useAuth();
  return (
    <div className="vp-shell">
      <header className="vp-topbar">
        <Logo />
        <nav aria-label="Account" className="vp-topnav">
          {user ? (
            <Link to="/account" className="btn btn-dark btn-sm">
              My account
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline-dark btn-sm">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-dark btn-sm">
                Create account
              </Link>
            </>
          )}
        </nav>
      </header>
      <div className="vp-content">
        <Outlet />
      </div>
    </div>
  );
}
