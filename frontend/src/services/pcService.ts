import type { AxiosResponse } from 'axios';
import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api';
import type { Pc, PcLookup } from '../types/domain';

export interface PcSearchParams {
  deadStockNo?: string;
  cpu?: string;
  ram?: string;
  disk?: string;
  os?: string;
  software?: string;
  warrantyStatus?: string;
}

export const searchPcs = (
  params: PcSearchParams,
): Promise<AxiosResponse<ApiResponse<Pc[]>>> =>
  apiClient.get<ApiResponse<Pc[]>>('/pc/search', { params });

// Public — confirms a dead stock number is real and shows its department/lab.
export const lookupPc = (
  deadStockNo: string,
): Promise<AxiosResponse<ApiResponse<PcLookup>>> =>
  apiClient.get<ApiResponse<PcLookup>>(`/pc/lookup/${encodeURIComponent(deadStockNo)}`);

// Intentionally POST, not GET — matches the backend route as it exists today.
export const getPcHealthCard = (
  id: string,
): Promise<AxiosResponse<ApiResponse<Pc>>> =>
  apiClient.post<ApiResponse<Pc>>(`/pc/${id}/health-card`);
