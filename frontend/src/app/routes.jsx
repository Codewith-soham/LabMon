import { Navigate, Route, Routes } from 'react-router-dom';
import AuthPage from '../features/auth/AuthPage';
import LabInchargeHome from '../features/lab-incharge/LabInchargeHome';
import HodHome from '../features/hod/HodHome';
import DeanInfraHome from '../features/dean-infra/DeanInfraHome';
import LaboratoriesPage from '../features/laboratories/LaboratoriesPage';
import EquipmentPage from '../features/equipment/EquipmentPage';
import InventoryPage from '../features/inventory/InventoryPage';
import RequestsPage from '../features/requests/RequestsPage';
import ProtectedRoute from '../components/common/ProtectedRoute';
import { ROLES } from '../constants/roles';
import { ROUTES } from '../constants/routes';

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.LOGIN} element={<AuthPage />} />

      <Route
        path={ROUTES.LAB_INCHARGE_HOME}
        element={
          <ProtectedRoute allowedRoles={[ROLES.LAB_INCHARGE]}>
            <LabInchargeHome />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.HOD_HOME}
        element={
          <ProtectedRoute allowedRoles={[ROLES.HOD]}>
            <HodHome />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.DEAN_INFRA_HOME}
        element={
          <ProtectedRoute allowedRoles={[ROLES.DEAN_INFRA]}>
            <DeanInfraHome />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.LABORATORIES}
        element={
          <ProtectedRoute allowedRoles={[ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA]}>
            <LaboratoriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.EQUIPMENT}
        element={
          <ProtectedRoute allowedRoles={[ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA]}>
            <EquipmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.INVENTORY}
        element={
          <ProtectedRoute allowedRoles={[ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA]}>
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path={ROUTES.REQUESTS}
        element={
          <ProtectedRoute allowedRoles={[ROLES.LAB_INCHARGE, ROLES.HOD, ROLES.DEAN_INFRA]}>
            <RequestsPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
    </Routes>
  );
}

export default AppRoutes;
