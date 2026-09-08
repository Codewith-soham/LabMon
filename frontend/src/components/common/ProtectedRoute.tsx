import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../constants/routes';
import type { UserRole } from '../../types/domain';

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children: ReactNode;
}

function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps): ReactNode {
  const { user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  // Authenticated but wrong role: show a real 403, don't bounce to the login page.
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.FORBIDDEN} replace />;
  }

  return children;
}

export default ProtectedRoute;
