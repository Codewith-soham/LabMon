import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../lab-incharge/LabInchargeHome.css';
import '../auth/AuthPage.css';
import './PcSearchPage.css';
import PcHealthCardModal from './PcHealthCardModal';
import { WARRANTY_STATUS_META } from './pcSearchMeta';
import { searchPcs } from '../../services/pcService';
import { useAuth } from '../../hooks/useAuth';
import { ROLES } from '../../constants/roles';
import { ROUTES } from '../../constants/routes';

const HOME_ROUTE_BY_ROLE = {
  [ROLES.LAB_INCHARGE]: ROUTES.LAB_INCHARGE_HOME,
  [ROLES.HOD]: ROUTES.HOD_HOME,
  [ROLES.DEAN_INFRA]: ROUTES.DEAN_INFRA_HOME,
};

const INITIAL_FILTERS = {
  deadStockNo: '',
  cpu: '',
  ram: '',
  disk: '',
  os: '',
  software: '',
  warrantyStatus: '',
};

function buildParams(filters) {
  const params = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (value.trim()) params[key] = value.trim();
  });
  return params;
}

function PcSearchPage() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedPc, setSelectedPc] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(HOME_ROUTE_BY_ROLE[user?.role] || ROUTES.LOGIN);
  };

  const runSearch = (params) => {
    setLoading(true);
    setLoadError('');
    searchPcs(params)
      .then((res) => setResults(res.data?.data || []))
      .catch((err) => setLoadError(err.response?.data?.message || 'Failed to load PCs.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runSearch({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = (field) => (e) => {
    setFilters((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(buildParams(filters));
  };

  const handleReset = () => {
    setFilters(INITIAL_FILTERS);
    runSearch({});
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-brand-title">LABMON</h1>
          <p className="dashboard-brand-subtitle">PC SEARCH</p>
        </div>
        <div className="dashboard-header-right">
          <span className="dashboard-user-name">{user?.name}</span>
          <span className="dashboard-dept-badge">{user?.department?.name || 'All Departments'}</span>
        </div>
      </header>

      <main className="dashboard-content">
        <div className="dashboard-toolbar dashboard-toolbar--start">
          <button type="button" className="back-btn" onClick={handleBack}>
            ← Back
          </button>
        </div>

        <section className="panel">
          <form className="pc-search-form" onSubmit={handleSubmit}>
            <div className="pc-search-field">
              <label className="field-label" htmlFor="deadStockNo">
                Dead Stock No.
              </label>
              <input
                id="deadStockNo"
                type="text"
                className="field-input"
                placeholder="e.g. DS-1023"
                value={filters.deadStockNo}
                onChange={updateField('deadStockNo')}
              />
            </div>

            <div className="pc-search-field">
              <label className="field-label" htmlFor="cpu">
                CPU
              </label>
              <input
                id="cpu"
                type="text"
                className="field-input"
                placeholder="e.g. i5"
                value={filters.cpu}
                onChange={updateField('cpu')}
              />
            </div>

            <div className="pc-search-field">
              <label className="field-label" htmlFor="ram">
                RAM
              </label>
              <input
                id="ram"
                type="text"
                className="field-input"
                placeholder="e.g. 16"
                value={filters.ram}
                onChange={updateField('ram')}
              />
            </div>

            <div className="pc-search-field">
              <label className="field-label" htmlFor="disk">
                Disk
              </label>
              <input
                id="disk"
                type="text"
                className="field-input"
                placeholder="e.g. 512"
                value={filters.disk}
                onChange={updateField('disk')}
              />
            </div>

            <div className="pc-search-field">
              <label className="field-label" htmlFor="os">
                OS
              </label>
              <input
                id="os"
                type="text"
                className="field-input"
                placeholder="e.g. Windows"
                value={filters.os}
                onChange={updateField('os')}
              />
            </div>

            <div className="pc-search-field">
              <label className="field-label" htmlFor="software">
                Software
              </label>
              <input
                id="software"
                type="text"
                className="field-input"
                placeholder="e.g. MATLAB"
                value={filters.software}
                onChange={updateField('software')}
              />
            </div>

            <div className="pc-search-field">
              <label className="field-label" htmlFor="warrantyStatus">
                Warranty Status
              </label>
              <select
                id="warrantyStatus"
                className="field-input"
                value={filters.warrantyStatus}
                onChange={updateField('warrantyStatus')}
              >
                <option value="">All</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
              </select>
            </div>

            <div className="pc-search-field pc-search-actions">
              <button type="submit" className="submit-btn pc-search-submit" disabled={loading}>
                {loading ? 'Searching…' : 'Search'}
              </button>
              <button type="button" className="pc-search-reset" onClick={handleReset} disabled={loading}>
                Reset
              </button>
            </div>
          </form>

          <div className="panel-header">
            <h2 className="panel-title">PCs</h2>
          </div>

          {loading ? (
            <p className="panel-state-text">Searching…</p>
          ) : loadError ? (
            <p className="panel-state-text panel-state-text--error">{loadError}</p>
          ) : (
            <table className="complaints-table">
              <thead>
                <tr>
                  <th>Dead Stock No.</th>
                  <th>Department</th>
                  <th>Lab</th>
                  <th>CPU</th>
                  <th>RAM</th>
                  <th>OS</th>
                  <th>Warranty</th>
                </tr>
              </thead>
              <tbody>
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="panel-state-text">
                      No PCs match your search.
                    </td>
                  </tr>
                ) : (
                  results.map((pc) => {
                    const meta = WARRANTY_STATUS_META[pc.warranty?.status] || {
                      label: pc.warranty?.status,
                      modifier: 'open',
                    };

                    return (
                      <tr key={pc._id} onClick={() => setSelectedPc(pc)}>
                        <td className="cell-description">{pc.deadStockNo}</td>
                        <td className="cell-muted">{pc.department?.name || '—'}</td>
                        <td className="cell-muted">{pc.lab?.name || '—'}</td>
                        <td className="cell-muted">{pc.config?.cpu || '—'}</td>
                        <td className="cell-muted">{pc.config?.ram || '—'}</td>
                        <td className="cell-muted">{pc.config?.os || '—'}</td>
                        <td>
                          <span className={`status-pill status-pill--${meta.modifier}`}>
                            <span className="status-dot" />
                            {meta.label}
                          </span>
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

      <PcHealthCardModal pc={selectedPc} onClose={() => setSelectedPc(null)} />
    </div>
  );
}

export default PcSearchPage;
