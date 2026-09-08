import type { ComplaintHistoryEntry, ComplaintStatus } from '../../types/domain';

interface StatusMeta {
  label: string;
  // Visual bucket only. 'escalated' is reused for the in-flight states to keep the
  // existing status-pill CSS; Phase 2 can rename the modifiers alongside the styles.
  modifier: 'open' | 'escalated' | 'resolved';
}

export const STATUS_META: Record<ComplaintStatus, StatusMeta> = {
  SUBMITTED: { label: 'Submitted', modifier: 'open' },
  ASSIGNED: { label: 'Assigned', modifier: 'escalated' },
  IN_PROGRESS: { label: 'In Progress', modifier: 'escalated' },
  RESOLVED: { label: 'Resolved', modifier: 'resolved' },
  CLOSED: { label: 'Closed', modifier: 'resolved' },
};

// Derived from STATUS_META so dashboard filtering/stats never drift from the status enum.
export const IN_PROGRESS_STATUSES: ComplaintStatus[] = (
  Object.keys(STATUS_META) as ComplaintStatus[]
).filter((status) => STATUS_META[status].modifier === 'escalated');

export const LEVEL_LABEL: Record<string, string> = {
  labIncharge: 'Lab Incharge',
  hod: 'HOD',
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
