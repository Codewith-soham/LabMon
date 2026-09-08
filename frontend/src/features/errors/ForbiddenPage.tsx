import { Link, useNavigate } from 'react-router-dom';
import '../auth/AuthPage.css';
import bgImage from '../../assets/college-bg.jpg';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES, type RoutePath } from '../../constants/routes';
import { ROLES } from '../../constants/roles';

const DASHBOARD_BY_ROLE: Partial<Record<string, RoutePath>> = {
  [ROLES.ADMIN]: ROUTES.ADMIN_DASHBOARD,
  [ROLES.HOD]: ROUTES.HOD_DASHBOARD,
  [ROLES.LAB_INCHARGE]: ROUTES.LAB_INCHARGE_DASHBOARD,
};

/**
 * 403 Access Denied. Shown by ProtectedRoute when an authenticated user's role is
 * not permitted for a route (an unauthenticated visitor is still sent to /login).
 */
function ForbiddenPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const homeRoute = (user && DASHBOARD_BY_ROLE[user.role]) || ROUTES.LOGIN;

  return (
    <div className="auth-page" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="auth-overlay" />

      <div className="auth-card">
        <div className="auth-header">
          <div className="accent-line" />
          <p className="portal-label">ACCESS DENIED</p>
          <h1 className="brand-title">403</h1>
        </div>

        <p style={{ textAlign: 'center', color: '#4b5563', fontSize: 14, lineHeight: 1.6 }}>
          {user
            ? `Your account (${user.role}) is not allowed to view this page.`
            : 'You do not have permission to view this page.'}
        </p>

        <button
          type="button"
          className="submit-btn"
          style={{ marginTop: 20 }}
          onClick={() => navigate(homeRoute, { replace: true })}
        >
          {user ? 'Go to my dashboard' : 'Go to staff login'}
        </button>

        <div className="public-links">
          <Link to={ROUTES.RAISE_COMPLAINT}>Raise a complaint</Link>|
          <Link to={ROUTES.TRACK_COMPLAINT}>Track a complaint</Link>
        </div>
      </div>
    </div>
  );
}

export default ForbiddenPage;
