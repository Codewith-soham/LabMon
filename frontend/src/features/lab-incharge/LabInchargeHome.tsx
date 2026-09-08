import ComplaintsDashboard from '../complaints/ComplaintsDashboard';
import { ROLES } from '../../constants/roles';

function LabInchargeHome() {
  return <ComplaintsDashboard role={ROLES.LAB_INCHARGE} subtitle="LAB INCHARGE" defaultName="Lab Incharge" />;
}

export default LabInchargeHome;
