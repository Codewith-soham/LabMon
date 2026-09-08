import { Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from '../features/auth/AuthPage';
import RaiseComplaintPage from '../features/public-complaint/RaiseComplaintPage';
import TrackComplaintPage from '../features/public-complaint/TrackComplaintPage';
import LabInchargeHome from '../features/lab-incharge/LabInchargeHome';
import HodHome from '../features/hod/HodHome';
import AdminHome from '../features/admin/AdminHome';
import ForbiddenPage from '../features/errors/ForbiddenPage';
import LaboratoriesPage from '../features/laboratories/LaboratoriesPage';
import EquipmentPage from '../features/equipment/EquipmentPage';
import InventoryPage from '../features/inventory/InventoryPage';
import RequestsPage from '../features/requests/RequestsPage';
import ProtectedRoute from '../components/common/ProtectedRoute';
import { ROLES } from '../constants/roles';
import { ROUTES, LEGACY_ROUTES } from '../constants/routes';

const STAFF_ROLES = [ROLES.ADMIN, ROLES.HOD, ROLES.LAB_INCHARGE];

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RaiseComplaintPage />} />
      <Route path={ROUTES.RAISE_COMPLAINT} element={<RaiseComplaintPage />} />
      <Route path={ROUTES.TRACK_COMPLAINT} element={<TrackComplaintPage />} />

      {/* Staff login. Phase 1: the role-specific paths render the shared AuthPage;
          Phase 3+ can specialise them without touching the route table. */}
      <Route path={ROUTES.LOGIN} element={<AuthPage />} />
      <Route path={ROUTES.ADMIN_LOGIN} element={<AuthPage />} />
      <Route path={ROUTES.HOD_LOGIN} element={<AuthPage />} />
      <Route path={ROUTES.LAB_INCHARGE_LOGIN} element={<AuthPage />} />

      <Route path={ROUTES.FORBIDDEN} element={<ForbiddenPage />} />

      <Route
        path={ROUTES.ADMIN_DASHBOARD}
        element={
          <ProtectedRoute allowedRoles={[ROLES.ADMIN]}>
            <AdminHome />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.HOD_DASHBOARD}
        element={
          <ProtectedRoute allowedRoles={[ROLES.HOD]}>
            <HodHome />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.LAB_INCHARGE_DASHBOARD}
        element={
          <ProtectedRoute allowedRoles={[ROLES.LAB_INCHARGE]}>
            <LabInchargeHome />
          </ProtectedRoute>
        }
      />

      <Route
        path={ROUTES.LABORATORIES}
        element={
          <ProtectedRoute allowedRoles={STAFF_ROLES}>
            <LaboratoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.EQUIPMENT}
        element={
          <ProtectedRoute allowedRoles={STAFF_ROLES}>
            <EquipmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.INVENTORY}
        element={
          <ProtectedRoute allowedRoles={STAFF_ROLES}>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.REQUESTS}
        element={
          <ProtectedRoute allowedRoles={STAFF_ROLES}>
            <RequestsPage />
          </ProtectedRoute>
        }
      />

      {/* Legacy paths kept as redirects so old bookmarks don't 404. */}
      <Route
        path={LEGACY_ROUTES.LAB_INCHARGE_HOME}
        element={<Navigate to={ROUTES.LAB_INCHARGE_DASHBOARD} replace />}
      />
      <Route
        path={LEGACY_ROUTES.HOD_HOME}
        element={<Navigate to={ROUTES.HOD_DASHBOARD} replace />}
      />
      <Route
        path={LEGACY_ROUTES.DEAN_INFRA_HOME}
        element={<Navigate to={ROUTES.ADMIN_DASHBOARD} replace />}
      />

      <Route path="*" element={<Navigate to={ROUTES.RAISE_COMPLAINT} replace />} />
    </Routes>
  );
}

export default AppRoutes;
