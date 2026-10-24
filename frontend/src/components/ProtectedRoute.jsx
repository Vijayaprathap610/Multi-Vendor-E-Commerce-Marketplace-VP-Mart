import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext.jsx';
import Forbidden from '../pages/Forbidden.jsx';

// UX guard only. The backend enforces every permission independently.
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="d-flex justify-content-center py-5" role="status" aria-live="polite">
        <Spinner animation="border" /> <span className="visually-hidden">Loading…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Forbidden />;
  return <Outlet />;
}
