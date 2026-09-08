import type { ComplaintHistoryEntry, ComplaintStatus } from '../../types/domain';

interface StatusMeta {
  label: string;
  modifier: 'open' | 'escalated' | 'resolved';
}

export const STATUS_META: Record<ComplaintStatus, StatusMeta> = {
  Open: { label: 'Open', modifier: 'open' },
  Escalated_HOD: { label: 'Escalated · HOD', modifier: 'escalated' },
  Escalated_Dean: { label: 'Escalated · Dean Infra', modifier: 'escalated' },
  Resolved: { label: 'Resolved', modifier: 'resolved' },
};

// Derived from STATUS_META so dashboard filtering/stats never drift from the status enum.
export const ESCALATED_STATUSES: ComplaintStatus[] = (
  Object.keys(STATUS_META) as ComplaintStatus[]
).filter((status) => STATUS_META[status].modifier === 'escalated');

export const LEVEL_LABEL: Record<string, string> = {
  labIncharge: 'Lab Incharge',
  hod: 'HOD',
  deanInfra: 'Dean Infra',
};

const ACTION_LABEL: Record<string, string> = {
  created: 'Complaint raised',
  escalated: 'Escalated',
  resolved: 'Resolved',
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function describeHistoryEntry(entry: ComplaintHistoryEntry): string {
  const actionLabel = ACTION_LABEL[entry.action] || entry.action;
  const levelLabel = LEVEL_LABEL[entry.level] || entry.level;
  const byName = entry.by?.name;

  if (entry.action === 'created') {
    return `${actionLabel} at ${levelLabel}`;
  }

  const who = byName ? ` by ${byName}` : '';
  return `${actionLabel}${who} — now at ${levelLabel}`;
}
