import type { WarrantyStatus } from '../../types/domain';

interface WarrantyMeta {
  label: string;
  modifier: 'resolved' | 'open';
}

export const WARRANTY_STATUS_META: Record<WarrantyStatus, WarrantyMeta> = {
  Active: { label: 'Active', modifier: 'resolved' },
  Expired: { label: 'Expired', modifier: 'open' },
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
