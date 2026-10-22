import { useState } from 'react';
import LabInchargeManagementPage from './LabInchargeManagementPage';
import ComplaintsDashboard from '../complaints/ComplaintsDashboard';
import { ROLES } from '../../constants/roles';

function HodHome() {
  const [activeView, setActiveView] = useState<'staff' | 'complaints'>('staff');

  if (activeView === 'complaints') {
    return (
      <div>
        <div style={{ background: '#0f172a', padding: '8px 24px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setActiveView('staff')}
            style={{
              background: '#e66a0a',
              color: '#ffffff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
            }}
          >
            ← Back to Lab Incharge Management
          </button>
        </div>
        <ComplaintsDashboard role={ROLES.HOD} subtitle="HOD" defaultName="HOD" />
      </div>
    );
  }

  return <LabInchargeManagementPage onSwitchToComplaints={() => setActiveView('complaints')} />;
}

export default HodHome;
