import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LabInchargeHome.css';
import '../auth/AuthPage.css';
import Donut from './Donut';
import ComplaintDetailModal from './ComplaintDetailModal';
import ResolveComplaintModal from './ResolveComplaintModal';
import { STATUS_META, formatDateTime } from './complaintMeta';
import { logout } from '../../services/authService';
import { listComplaints, escalateComplaint, resolveComplaint } from '../../services/complaintService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';

function LabInchargeHome() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [resolvingComplaint, setResolvingComplaint] = useState(null);
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const role = user?.role || ROLES.LAB_INCHARGE;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listComplaints()
      .then((res) => {
        if (!cancelled) setComplaints(res.data?.data || []);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.response?.data?.message || 'Failed to load complaints.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedComplaint = complaints.find((c) => c._id === selectedId) || null;

  const canAct = (complaint) => complaint.currentLevel === role && complaint.status !== 'Resolved';

  const stats = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === 'Open').length;
    const escalated = complaints.filter(
      (c) => c.status === 'Escalated_HOD' || c.status === 'Escalated_Dean',
    ).length;
    const resolved = complaints.filter((c) => c.status === 'Resolved').length;
    return { total, open, escalated, resolved };
  }, [complaints]);

  const replaceComplaint = (updated) => {
    setComplaints((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
  };

  const handleEscalate = async (id) => {
    setActionError('');
    try {
      const res = await escalateComplaint(id);
      replaceComplaint(res.data.data);
    } catch (err) {
      setActionError(err.response?.data?.message || 'Failed to escalate complaint.');
    }
  };

  const handleResolveClick = (complaint) => {
    setResolveError('');
    setResolvingComplaint(complaint);
  };

  const handleResolveSubmit = async (id, remarks) => {
    setResolveSubmitting(true);
    setResolveError('');
    try {
      const res = await resolveComplaint(id, remarks);
      replaceComplaint(res.data.data);
      setResolvingComplaint(null);
      setSelectedId(null);
    } catch (err) {
      setResolveError(err.response?.data?.message || 'Failed to resolve complaint.');
    } finally {
      setResolveSubmitting(false);
    }
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
          <span className="dashboard-user-name">{user?.name || 'Lab Incharge'}</span>
          <span className="dashboard-dept-badge">
            {user?.department?.name || 'Department'}
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
          </div>

          {actionError && <p className="form-message form-message-error panel-error">{actionError}</p>}

          {loading ? (
            <p className="panel-state-text">Loading complaints…</p>
          ) : loadError ? (
            <p className="panel-state-text panel-state-text--error">{loadError}</p>
          ) : (
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
                {complaints.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="panel-state-text">
                      No complaints yet.
                    </td>
                  </tr>
                ) : (
                  complaints.map((complaint) => {
                    const meta = STATUS_META[complaint.status];
                    const actionable = canAct(complaint);

                    return (
                      <tr key={complaint._id} onClick={() => setSelectedId(complaint._id)}>
                        <td className="cell-description">{complaint.description}</td>
                        <td className="cell-muted">{complaint.raisedBy?.name}</td>
                        <td className="cell-muted">{formatDateTime(complaint.createdAt)}</td>
                        <td>
                          <span className={`status-pill status-pill--${meta.modifier}`}>
                            <span className="status-dot" />
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          {actionable ? (
                            <div className="row-actions">
                              <button
                                type="button"
                                className="action-btn action-btn--escalate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEscalate(complaint._id);
                                }}
                              >
                                Escalate
                              </button>
                              <button
                                type="button"
                                className="action-btn action-btn--resolve"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleResolveClick(complaint);
                                }}
                              >
                                Resolve
                              </button>
                            </div>
                          ) : (
                            <span className="row-actions-none">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <ComplaintDetailModal
        complaint={selectedComplaint}
        canAct={selectedComplaint ? canAct(selectedComplaint) : false}
        onClose={() => setSelectedId(null)}
        onEscalate={handleEscalate}
        onResolveClick={handleResolveClick}
      />

      <ResolveComplaintModal
        complaint={resolvingComplaint}
        onCancel={() => setResolvingComplaint(null)}
        onSubmit={handleResolveSubmit}
        submitting={resolveSubmitting}
        error={resolveError}
      />
    </div>
  );
}

export default LabInchargeHome;
