import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './ComplaintsDashboard.css';
import '../auth/AuthPage.css';
import Donut from './Donut';
import ComplaintDetailModal from './ComplaintDetailModal';
import ResolveComplaintModal from './ResolveComplaintModal';
import { STATUS_META, ESCALATED_STATUSES, formatDateTime } from './complaintMeta';
import { logout } from '../../services/authService';
import { listComplaints, escalateComplaint, resolveComplaint } from '../../services/complaintService';
import { useAuth } from '../../hooks/useAuth';
import { ROUTES } from '../../constants/routes';
import { ROLES } from '../../constants/roles';
import { getApiErrorMessage } from '../../types/api';
import type { Complaint, UserRole } from '../../types/domain';

interface ComplaintsDashboardProps {
  role: UserRole;
  subtitle: string;
  defaultName: string;
}

type StatusFilter = 'all' | 'open' | 'escalated' | 'resolved';

function ComplaintsDashboard({ role, subtitle, defaultName }: ComplaintsDashboardProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [resolvingComplaint, setResolvingComplaint] = useState<Complaint | null>(null);
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const effectiveRole: UserRole = user?.role || role;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listComplaints()
      .then((res) => {
        if (!cancelled) setComplaints(res.data?.data || []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(getApiErrorMessage(err, 'Failed to load complaints.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedComplaint = complaints.find((c) => c._id === selectedId) || null;

  const canAct = (complaint: Complaint) =>
    complaint.currentLevel === effectiveRole && complaint.status !== 'Resolved';
  const canEscalate = (complaint: Complaint) =>
    canAct(complaint) && effectiveRole !== ROLES.DEAN_INFRA;
  const showDepartmentColumn = effectiveRole === ROLES.DEAN_INFRA;

  const stats = useMemo(() => {
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === 'Open').length;
    const escalated = complaints.filter((c) => ESCALATED_STATUSES.includes(c.status)).length;
    const resolved = complaints.filter((c) => c.status === 'Resolved').length;
    return { total, open, escalated, resolved };
  }, [complaints]);

  const visibleComplaints = useMemo(() => {
    let list = complaints;

    if (statusFilter === 'open') {
      list = list.filter((c) => c.status === 'Open');
    } else if (statusFilter === 'escalated') {
      list = list.filter((c) => ESCALATED_STATUSES.includes(c.status));
    } else if (statusFilter === 'resolved') {
      list = list.filter((c) => c.status === 'Resolved');
    }

    const term = searchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter(
        (c) =>
          c.description?.toLowerCase().includes(term) ||
          c.raisedBy?.name?.toLowerCase().includes(term) ||
          c.token?.toLowerCase().includes(term),
      );
    }

    return list;
  }, [complaints, statusFilter, searchTerm]);

  const replaceComplaint = (updated: Complaint) => {
    setComplaints((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
  };

  const handleEscalate = async (id: string) => {
    setActionError('');
    try {
      const res = await escalateComplaint(id);
      replaceComplaint(res.data.data);
    } catch (err: unknown) {
      setActionError(getApiErrorMessage(err, 'Failed to escalate complaint.'));
    }
  };

  const handleResolveClick = (complaint: Complaint) => {
    setResolveError('');
    setResolvingComplaint(complaint);
  };

  const handleResolveSubmit = async (id: string, remarks: string) => {
    setResolveSubmitting(true);
    setResolveError('');
    try {
      const res = await resolveComplaint(id, remarks);
      replaceComplaint(res.data.data);
      setResolvingComplaint(null);
      setSelectedId(null);
    } catch (err: unknown) {
      setResolveError(getApiErrorMessage(err, 'Failed to resolve complaint.'));
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
          <p className="dashboard-brand-subtitle">{subtitle}</p>
        </div>
        <div className="dashboard-header-right">
          <span className="dashboard-user-name">{user?.name || defaultName}</span>
          <span className="dashboard-dept-badge">{user?.department?.name || 'Department'}</span>
          <button type="button" className="dashboard-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="dashboard-toolbar">
          <Link to={ROUTES.LABORATORIES} className="pc-search-link-btn">
            PC Search
          </Link>
        </div>

        <section className="stat-grid">
          <button
            type="button"
            className={`stat-card stat-card--filterable ${statusFilter === 'all' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <div>
              <p className="stat-card-label">Total Complaints</p>
              <p className="stat-card-value">{stats.total}</p>
            </div>
          </button>

          <button
            type="button"
            className={`stat-card stat-card--filterable ${statusFilter === 'open' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter('open')}
          >
            <div>
              <p className="stat-card-label">Open</p>
              <p className="stat-card-value">{stats.open}</p>
              <p className="stat-card-sub">of {stats.total} total</p>
            </div>
            <Donut value={stats.open} total={stats.total} colorClass="donut-value--orange" />
          </button>

          <button
            type="button"
            className={`stat-card stat-card--filterable ${statusFilter === 'escalated' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter('escalated')}
          >
            <div>
              <p className="stat-card-label">Escalated</p>
              <p className="stat-card-value">{stats.escalated}</p>
              <p className="stat-card-sub">of {stats.total} total</p>
            </div>
            <Donut value={stats.escalated} total={stats.total} colorClass="donut-value--blue" />
          </button>

          <button
            type="button"
            className={`stat-card stat-card--filterable ${statusFilter === 'resolved' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter('resolved')}
          >
            <div>
              <p className="stat-card-label">Resolved</p>
              <p className="stat-card-value">{stats.resolved}</p>
              <p className="stat-card-sub">of {stats.total} total</p>
            </div>
            <Donut value={stats.resolved} total={stats.total} colorClass="donut-value--teal" />
          </button>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Recent Complaints</h2>
            <form className="complaints-search" onSubmit={(e) => e.preventDefault()}>
              <input
                type="text"
                className="complaints-search-input"
                placeholder="Search by description, complainant, or token…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button type="submit" className="complaints-search-btn">
                Search
              </button>
            </form>
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
                  {showDepartmentColumn && <th>Department</th>}
                  <th>Raised By</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleComplaints.length === 0 ? (
                  <tr>
                    <td colSpan={showDepartmentColumn ? 6 : 5} className="panel-state-text">
                      {complaints.length === 0
                        ? 'No complaints yet.'
                        : 'No complaints match your filters.'}
                    </td>
                  </tr>
                ) : (
                  visibleComplaints.map((complaint) => {
                    const meta = STATUS_META[complaint.status];
                    const escalatable = canEscalate(complaint);
                    const resolvable = canAct(complaint);

                    return (
                      <tr key={complaint._id} onClick={() => setSelectedId(complaint._id)}>
                        <td className="cell-description">{complaint.description}</td>
                        {showDepartmentColumn && (
                          <td className="cell-muted">{complaint.department?.name}</td>
                        )}
                        <td className="cell-muted">{complaint.raisedBy?.name}</td>
                        <td className="cell-muted">{formatDateTime(complaint.createdAt)}</td>
                        <td>
                          <span className={`status-pill status-pill--${meta.modifier}`}>
                            <span className="status-dot" />
                            {meta.label}
                          </span>
                        </td>
                        <td>
                          {escalatable || resolvable ? (
                            <div className="row-actions">
                              {escalatable && (
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
                              )}
                              {resolvable && (
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
                              )}
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
        canEscalate={selectedComplaint ? canEscalate(selectedComplaint) : false}
        canResolve={selectedComplaint ? canAct(selectedComplaint) : false}
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

export default ComplaintsDashboard;
