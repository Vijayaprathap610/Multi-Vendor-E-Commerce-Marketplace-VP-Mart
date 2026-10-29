import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCategories } from '../hooks/useCategories.js';
import { catalogService } from '../services/catalogService.js';

const SOCIAL = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', youtube: 'YouTube' };
const PAYMENT_LABEL = { online: 'Online payment', cod: 'Cash on Delivery' };

const COLS = [
  [
    'About VP Mart',
    [
      ['/about', 'About Us'],
      ['/contact', 'Contact Us'],
      ['/about#marketplace', 'Marketplace information'],
    ],
  ],
  [
    'Customer Service',
    [
      ['/help', 'Help Center'],
      ['/faq', 'FAQs'],
      ['/shipping-delivery', 'Shipping and Delivery'],
      ['/returns-refunds', 'Returns and Refunds'],
      ['/track-order', 'Order Tracking'],
    ],
  ],
  [
    'Policies',
    [
      ['/privacy', 'Privacy Policy'],
      ['/terms', 'Terms and Conditions'],
      ['/shipping-policy', 'Shipping Policy'],
      ['/cancellation-refund-policy', 'Cancellation and Refund Policy'],
      ['/cookies', 'Cookie Policy'],
    ],
  ],
];

export default function Footer() {
  const cats = useCategories();
  const { user } = useAuth();
  const [config, setConfig] = useState({ social: {}, paymentMethods: [] });
  useEffect(() => {
    catalogService
      .config()
      .then(setConfig)
      .catch(() => {});
  }, []);
  const social = Object.entries(config.social || {});
  const pay = (config.paymentMethods || []).map((m) => PAYMENT_LABEL[m] || m);

  return (
    <footer className="vp-footer">
      <div className="vp-footer-grid">
        {COLS.slice(0, 2).map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="vp-fh">{title}</h2>
            <ul>
              {links.map(([to, label]) => (
                <li key={to}>
                  <Link to={to}>{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
        <nav aria-label="Shopping categories">
          <h2 className="vp-fh">Shopping Categories</h2>
          <ul className="vp-fcats">
            {cats.map((c) => (
              <li key={c.id}>
                <Link to={`/c/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={COLS[2][0]}>
          <h2 className="vp-fh">{COLS[2][0]}</h2>
          <ul>
            {COLS[2][1].map(([to, label]) => (
              <li key={to}>
                <Link to={to}>{label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Account">
          <h2 className="vp-fh">Account</h2>
          <ul>
            <li>
              <Link to={user ? '/account' : '/login'}>My Account</Link>
            </li>
            <li>
              <Link to={user ? '/orders' : '/login'}>My Orders</Link>
            </li>
            <li>
              <Link to="/contact">Contact Support</Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="vp-footer-base">
        <Logo size="md" />
        <p className="vp-copy">© {new Date().getFullYear()} VP Mart. All rights reserved.</p>
        {pay.length > 0 && <p className="vp-fpay">Payment options: {pay.join(' · ')}</p>}
        {social.length > 0 && (
          <ul className="vp-social" aria-label="Social media">
            {social.map(([k, url]) => (
              <li key={k}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {SOCIAL[k] || k}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
