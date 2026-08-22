import ComplaintsDashboard from '../complaints/ComplaintsDashboard';
import { ROLES } from '../../constants/roles';

function HodHome() {
  return <ComplaintsDashboard role={ROLES.HOD} subtitle="HOD" defaultName="HOD" />;
}

export default HodHome;
