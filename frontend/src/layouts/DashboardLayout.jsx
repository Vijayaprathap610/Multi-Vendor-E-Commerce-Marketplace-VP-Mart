import { FiLogOut } from 'react-icons/fi';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useSeo } from '../hooks/useSeo.js';

// Shared shell for the Vendor and Admin dashboards.
export default function DashboardLayout({ title, nav }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  useSeo({ title, description: `${title} on VP Mart`, noindex: true });
  return (
    <div className="vp-dash">
      <header className="vp-dash-top">
        <Logo />
        <span className="vp-dash-title">{title}</span>
        <span className="vp-dash-user">
          <Link to="/">View shop</Link>
          <span className="text-secondary">{user.name}</span>
          <button
            type="button"
            className="btn btn-sm btn-outline-dark"
            onClick={async () => {
              await logout();
              navigate('/');
            }}
          >
            <FiLogOut aria-hidden="true" /> Sign out
          </button>
        </span>
      </header>
      <div className="vp-dash-body">
        <nav className="vp-dash-nav" aria-label={`${title} sections`}>
          {nav.map(([to, label, end]) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? 'on' : '')}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <main className="vp-dash-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
