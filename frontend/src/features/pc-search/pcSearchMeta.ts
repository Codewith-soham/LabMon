export const WARRANTY_STATUS_META = {
  Active: { label: 'Active', modifier: 'resolved' },
  Expired: { label: 'Expired', modifier: 'open' },
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
