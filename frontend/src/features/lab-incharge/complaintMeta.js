export const STATUS_META = {
  Open: { label: 'Open', modifier: 'open' },
  Escalated_HOD: { label: 'Escalated · HOD', modifier: 'escalated' },
  Escalated_Dean: { label: 'Escalated · Dean Infra', modifier: 'escalated' },
  Resolved: { label: 'Resolved', modifier: 'resolved' },
};

export const LEVEL_LABEL = {
  labIncharge: 'Lab Incharge',
  hod: 'HOD',
  deanInfra: 'Dean Infra',
};

const ACTION_LABEL = {
  created: 'Complaint raised',
  escalated: 'Escalated',
  resolved: 'Resolved',
};

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function describeHistoryEntry(entry) {
  const actionLabel = ACTION_LABEL[entry.action] || entry.action;
  const levelLabel = LEVEL_LABEL[entry.level] || entry.level;
  const byName = entry.by?.name;

  if (entry.action === 'created') {
    return `${actionLabel} at ${levelLabel}`;
  }

  const who = byName ? ` by ${byName}` : '';
  return `${actionLabel}${who} — now at ${levelLabel}`;
}
