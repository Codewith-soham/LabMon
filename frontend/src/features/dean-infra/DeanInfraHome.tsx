import ComplaintsDashboard from '../complaints/ComplaintsDashboard';
import { ROLES } from '../../constants/roles';

function DeanInfraHome() {
  return <ComplaintsDashboard role={ROLES.DEAN_INFRA} subtitle="DEAN INFRA" defaultName="Dean Infra" />;
}

export default DeanInfraHome;
