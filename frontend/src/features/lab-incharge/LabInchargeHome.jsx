import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LabInchargeHome.css';
import '../auth/AuthPage.css';
import Donut from './Donut';
import ComplaintDetailModal from './ComplaintDetailModal';
import { INITIAL_COMPLAINTS, STATUS_META } from './complaintData';
import { logout } from '../../services/authService';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../constants/routes';

function LabInchargeHome() {
  const [complaints, setComplaints] = useState(INITIAL_COMPLAINTS);
  const [selectedId, setSelectedId] = useState(null);
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const selectedComplaint = complaints.find((c) => c.id === selectedId) || null;

  const stats = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === 'Open').length;
    const escalated = complaints.filter((c) => c.status === 'Escalated').length;
    const resolved = complaints.filter((c) => c.status === 'Resolved').length;
    return { total, open, escalated, resolved };
  }, [complaints]);

  const appendHistory = (complaint, entry) => ({
    ...complaint,
    history: [...complaint.history, entry],
  });

  const handleEscalate = (id) => {
    setComplaints((prev) =>
      prev.map((c) =>
        c.id === id
          ? appendHistory({ ...c, status: 'Escalated', level: 'HOD' }, `${c.date} — Escalated to HOD by Lab Incharge`)
          : c,
      ),
    );
    setSelectedId(null);
  };

  const handleResolve = (id) => {
    setComplaints((prev) =>
      prev.map((c) =>
        c.id === id
          ? appendHistory({ ...c, status: 'Resolved' }, `${c.date} — Resolved by Lab Incharge`)
          : c,
      ),
    );
    setSelectedId(null);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore network errors on logout, clear local session regardless
    } finally {
      localStorage.removeItem('accessToken');
      setUser(null);
      navigate(ROUTES.LOGIN, { replace: true });
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-brand-title">LABMON</h1>
          <p className="dashboard-brand-subtitle">LAB INCHARGE</p>
        </div>
        <div className="dashboard-header-right">
          <span className="dashboard-user-name">{user?.name || 'Dr. Lakshmi Patel'}</span>
          <span className="dashboard-dept-badge">
            {user?.department || 'Computer Science Lab'}
          </span>
          <button type="button" className="dashboard-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <section className="stat-grid">
          <div className="stat-card">
            <div>
              <p className="stat-card-label">Total Complaints</p>
              <p className="stat-card-value">{stats.total}</p>
            </div>
          </div>

          <div className="stat-card">
            <div>
              <p className="stat-card-label">Open</p>
              <p className="stat-card-value">{stats.open}</p>
              <p className="stat-card-sub">of {stats.total} total</p>
            </div>
            <Donut value={stats.open} total={stats.total} colorClass="donut-value--orange" />
          </div>

          <div className="stat-card">
            <div>
              <p className="stat-card-label">Escalated</p>
              <p className="stat-card-value">{stats.escalated}</p>
              <p className="stat-card-sub">of {stats.total} total</p>
            </div>
            <Donut value={stats.escalated} total={stats.total} colorClass="donut-value--blue" />
          </div>

          <div className="stat-card">
            <div>
              <p className="stat-card-label">Resolved</p>
              <p className="stat-card-value">{stats.resolved}</p>
              <p className="stat-card-sub">of {stats.total} total</p>
            </div>
            <Donut value={stats.resolved} total={stats.total} colorClass="donut-value--teal" />
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Recent Complaints</h2>
            <button type="button" className="panel-link">
              View All
            </button>
          </div>

          <table className="complaints-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Raised By</th>
                <th>Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {complaints.map((complaint) => {
                const meta = STATUS_META[complaint.status];
                const canEscalate = complaint.status === 'Open';
                const canResolve = complaint.status !== 'Resolved';

                return (
                  <tr key={complaint.id} onClick={() => setSelectedId(complaint.id)}>
                    <td className="cell-description">{complaint.description}</td>
                    <td className="cell-muted">{complaint.raisedBy}</td>
                    <td className="cell-muted">{complaint.date}</td>
                    <td>
                      <span className={`status-pill status-pill--${meta.modifier}`}>
                        <span className="status-dot" />
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      {canEscalate || canResolve ? (
                        <div className="row-actions">
                          {canEscalate && (
                            <button
                              type="button"
                              className="action-btn action-btn--escalate"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEscalate(complaint.id);
                              }}
                            >
                              Escalate
                            </button>
                          )}
                          {canResolve && (
                            <button
                              type="button"
                              className="action-btn action-btn--resolve"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolve(complaint.id);
                              }}
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="row-actions-none">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </main>

      <ComplaintDetailModal
        complaint={selectedComplaint}
        onClose={() => setSelectedId(null)}
        onEscalate={handleEscalate}
        onResolve={handleResolve}
      />
    </div>
  );
}

export default LabInchargeHome;
