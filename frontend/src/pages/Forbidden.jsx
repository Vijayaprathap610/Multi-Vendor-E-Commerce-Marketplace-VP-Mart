import { Link } from 'react-router-dom';

export default function Forbidden() {
  return (
    <section className="container py-5 text-center" role="alert">
      <h1 className="h2">You don’t have access to this page</h1>
      <p className="text-secondary">Your account type does not include this area.</p>
      <Link to="/" className="btn btn-dark">
        Back to home
      </Link>
    </section>
  );
}
