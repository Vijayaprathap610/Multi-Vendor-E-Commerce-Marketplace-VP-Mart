import Logo from '../components/Logo.jsx';

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="vp-auth">
      <main className="vp-auth-main">
        <Logo size="lg" />
        <h1 className="vp-auth-title">{title}</h1>
        {subtitle && <p className="vp-auth-sub">{subtitle}</p>}
        <div className="vp-auth-card">{children}</div>
        {footer && <div className="vp-auth-foot">{footer}</div>}
      </main>
      <aside className="vp-auth-aside" aria-hidden="true">
        <p className="vp-aside-big">
          One marketplace.
          <br />
          Many independent shops.
        </p>
        <p className="vp-aside-small">
          Buy from sellers across categories, sell your own products, or deliver orders in your
          area.
        </p>
      </aside>
    </div>
  );
}
