import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Home() {
  const { user } = useAuth();
  return (
    <section className="vp-home container py-5">
      <h1 className="display-5 fw-bold">Welcome to VP Mart</h1>
      <p className="lead text-secondary col-lg-7 px-0">
        A multi-vendor marketplace for buyers, sellers and delivery partners. The product catalogue
        is being built; accounts and sign-in are available now.
      </p>
      {!user && (
        <div className="d-flex gap-2 flex-wrap">
          <Link to="/register" className="btn btn-dark">
            Create an account
          </Link>
          <Link to="/login" className="btn btn-outline-dark">
            Sign in
          </Link>
        </div>
      )}
    </section>
  );
}
