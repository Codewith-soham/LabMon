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

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  return children;
}

export default ProtectedRoute;
