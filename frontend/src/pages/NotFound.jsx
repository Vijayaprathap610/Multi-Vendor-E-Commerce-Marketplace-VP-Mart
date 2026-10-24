import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="container py-5 text-center">
      <h1 className="h2">Page not found</h1>
      <p className="text-secondary">The page you are looking for does not exist or has moved.</p>
      <Link to="/" className="btn btn-dark">
        Back to home
      </Link>
    </section>
  );
}
