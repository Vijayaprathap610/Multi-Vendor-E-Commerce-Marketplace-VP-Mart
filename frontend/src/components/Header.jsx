import { useEffect, useRef, useState } from 'react';
import { Dropdown, Offcanvas } from 'react-bootstrap';
import { FiMapPin, FiMenu, FiShoppingCart, FiUser } from 'react-icons/fi';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from './Logo.jsx';
import SearchBox from './SearchBox.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useLocationPin } from '../context/LocationContext.jsx';
import { useCategories } from '../hooks/useCategories.js';

// Every item has a real destination. "Kids & Toys" spans two top-level categories, so it opens
// a search across both. Mobiles is a sub-category of Electronics.
export const SECONDARY_NAV = [
  { label: 'Trending', to: '/trending' },
  { label: 'Best Sellers', to: '/best-sellers' },
  { label: 'Today’s Deals', to: '/deals' },
  { label: 'Coupons & Offers', to: '/offers' },
  { label: 'Electronics', to: '/c/electronics' },
  { label: 'Mobiles', to: '/c/mobiles' },
  { label: 'Fashion', to: '/c/fashion' },
  { label: 'Groceries', to: '/c/groceries' },
  { label: 'Home & Kitchen', to: '/c/home-kitchen' },
  { label: 'Kids & Toys', to: '/search?category=kids-baby,toys-games' },
  { label: 'New Arrivals', to: '/new-arrivals' },
];

function AllCategories({ cats }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="vp-allcats" ref={ref}>
      <button
        type="button"
        className="vp-allcats-btn"
        aria-expanded={open}
        aria-controls="vp-allcats-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <FiMenu aria-hidden="true" /> All Categories
      </button>
      {open && (
        <div
          id="vp-allcats-panel"
          className="vp-allcats-panel"
          role="region"
          aria-label="All categories"
        >
          {cats.map((c) => (
            <div key={c.id} className="vp-allcats-col">
              <Link to={`/c/${c.slug}`} className="vp-allcats-top" onClick={() => setOpen(false)}>
                {c.imageUrl && (
                  <img
                    src={c.imageUrl}
                    alt=""
                    width="20"
                    height="20"
                    style={{ borderRadius: '4px', objectFit: 'cover', marginRight: '6px' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                {c.name}
              </Link>
              <ul>
                {c.children.map((s) => (
                  <li key={s.id}>
                    <Link to={`/c/${s.slug}`} onClick={() => setOpen(false)}>
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!cats.length && <p className="text-secondary mb-0">Categories are loading…</p>}
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const first = user?.name?.split(' ')[0];
  const dashboards = {
    vendor: ['/vendor', 'Vendor dashboard'],
    admin: ['/admin', 'Admin dashboard'],
    delivery_agent: ['/agent', 'Delivery agent dashboard'],
  };
  return (
    <Dropdown align="end" className="vp-acct">
      <Dropdown.Toggle as="button" className="vp-hbtn" id="vp-acct-toggle">
        <FiUser aria-hidden="true" />
        <span className="vp-hbtn-t">
          <small>{user ? `Hello, ${first}` : 'Hello, sign in'}</small>
          <strong>Account</strong>
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {!user ? (
          <div className="px-3 py-2" style={{ minWidth: 220 }}>
            <Link to="/login" className="btn btn-dark w-100 mb-2">
              Sign in
            </Link>
            <small className="text-secondary">
              New to VP Mart? <Link to="/register">Create an account</Link>
            </small>
          </div>
        ) : (
          <>
            {dashboards[user.role] && (
              <Dropdown.Item as={Link} to={dashboards[user.role][0]}>
                {dashboards[user.role][1]}
              </Dropdown.Item>
            )}
            <Dropdown.Item as={Link} to="/account">
              My account
            </Dropdown.Item>
            {user.role === 'buyer' && (
              <Dropdown.Item as={Link} to="/orders">
                My orders
              </Dropdown.Item>
            )}
            <Dropdown.Divider />
            <Dropdown.Item
              as="button"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
            >
              Sign out
            </Dropdown.Item>
          </>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default function Header() {
  const { user } = useAuth();
  const { count } = useCart();
  const { pincode, openPicker } = useLocationPin();
  const cats = useCategories();
  const [menu, setMenu] = useState(false);
  const showBuyerLinks = !user || user.role === 'buyer';

  return (
    <header className="vp-header">
      <div className="vp-h1">
        <button
          type="button"
          className="vp-hamburger"
          aria-label="Open menu"
          onClick={() => setMenu(true)}
        >
          <FiMenu aria-hidden="true" />
        </button>
        <Logo />
        <button type="button" className="vp-hbtn vp-loc" onClick={openPicker}>
          <FiMapPin aria-hidden="true" />
          <span className="vp-hbtn-t">
            <small>{pincode ? 'Deliver to' : 'Delivery'}</small>{' '}
            <strong>{pincode || 'Select PIN code'}</strong>
          </span>
        </button>
        <div className="vp-h-search">
          <SearchBox categories={cats} />
        </div>
        <span
          className="vp-region"
          title="VP Mart currently serves India and prices are in Indian rupees"
        >
          <small>Region</small>
          <strong>IN · ₹ INR</strong>
        </span>
        <NotificationBell />
        <AccountMenu />
        {showBuyerLinks && (
          <Link to="/orders" className="vp-hbtn vp-orders">
            <span className="vp-hbtn-t">
              <small>Returns</small>
              <strong>& Orders</strong>
            </span>
          </Link>
        )}
        <Link to="/cart" className="vp-hbtn vp-cartbtn">
          <FiShoppingCart aria-hidden="true" />
          <span className="vp-cart-n" aria-hidden="true">
            {count}
          </span>
          <strong className="vp-hbtn-t">Cart</strong>{' '}
          <span className="visually-hidden">{`${count} ${count === 1 ? 'item' : 'items'}`}</span>
        </Link>
      </div>
      <div className="vp-h-search-m">
        <SearchBox categories={cats} />
      </div>
      <nav className="vp-h2" aria-label="Shop by">
        <AllCategories cats={cats} />
        <ul className="vp-h2-list">
          {SECONDARY_NAV.map((n) => (
            <li key={n.label}>
              <NavLink to={n.to} end className={({ isActive }) => (isActive ? 'on' : '')}>
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Offcanvas
        show={menu}
        onHide={() => setMenu(false)}
        placement="start"
        aria-labelledby="vp-menu-title"
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title id="vp-menu-title">
            <Logo />
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <button
            type="button"
            className="btn btn-outline-dark w-100 mb-3 text-start"
            onClick={() => {
              setMenu(false);
              openPicker();
            }}
          >
            <FiMapPin aria-hidden="true" />{' '}
            {pincode ? `Deliver to ${pincode}` : 'Select delivery location'}
          </button>
          {!user ? (
            <div className="d-grid gap-2 mb-3">
              <Link to="/login" className="btn btn-dark" onClick={() => setMenu(false)}>
                Sign in
              </Link>
              <Link to="/register" className="btn btn-outline-dark" onClick={() => setMenu(false)}>
                Create account
              </Link>
            </div>
          ) : (
            <ul className="vp-mnav">
              <li>
                <Link to="/account" onClick={() => setMenu(false)}>
                  My account
                </Link>
              </li>
              {user.role === 'buyer' && (
                <li>
                  <Link to="/orders" onClick={() => setMenu(false)}>
                    Returns & Orders
                  </Link>
                </li>
              )}
              {user.role === 'vendor' && (
                <li>
                  <Link to="/vendor" onClick={() => setMenu(false)}>
                    Vendor dashboard
                  </Link>
                </li>
              )}
              {user.role === 'admin' && (
                <li>
                  <Link to="/admin" onClick={() => setMenu(false)}>
                    Admin dashboard
                  </Link>
                </li>
              )}
            </ul>
          )}
          <h3 className="h6 text-uppercase text-secondary mt-3">Shop</h3>
          <ul className="vp-mnav">
            {SECONDARY_NAV.map((n) => (
              <li key={n.label}>
                <Link to={n.to} onClick={() => setMenu(false)}>
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="h6 text-uppercase text-secondary mt-3">All categories</h3>
          <ul className="vp-mnav">
            {cats.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.slug}`} onClick={() => setMenu(false)}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </Offcanvas.Body>
      </Offcanvas>
    </header>
  );
}
