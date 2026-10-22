import { useState } from 'react';
import StaffManagementPage from './StaffManagementPage';
import ComplaintsDashboard from '../complaints/ComplaintsDashboard';
import { ROLES } from '../../constants/roles';

function AdminHome() {
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
            ← Back to HOD Management
          </button>
        </div>
        <ComplaintsDashboard role={ROLES.ADMIN} subtitle="ADMIN" defaultName="Admin" />
      </div>
    );
  }

  return <StaffManagementPage onSwitchToComplaints={() => setActiveView('complaints')} />;
}

export default AdminHome;
