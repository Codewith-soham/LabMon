import ComplaintsDashboard from '../complaints/ComplaintsDashboard';
import { ROLES } from '../../constants/roles';

// Phase 1 scaffold: reuses the shared complaints dashboard, unscoped (Admin sees all).
// The real Admin staff-management dashboard lands in Phase 6.
function AdminHome() {
  return <ComplaintsDashboard role={ROLES.ADMIN} subtitle="ADMIN" defaultName="Admin" />;
}

export default AdminHome;
