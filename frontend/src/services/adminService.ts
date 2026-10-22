import type { AxiosResponse } from 'axios';
import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api';
import type { AuthUser } from '../types/domain';

export interface CreateHodPayload {
  name: string;
  email: string;
  password: string;
  department: string;
}

export const listHods = (): Promise<AxiosResponse<ApiResponse<AuthUser[]>>> =>
  apiClient.get<ApiResponse<AuthUser[]>>('/admin/staff');

export const createHod = (
  payload: CreateHodPayload,
): Promise<AxiosResponse<ApiResponse<AuthUser>>> =>
  apiClient.post<ApiResponse<AuthUser>>('/admin/staff', payload);

export const toggleHodActive = (
  id: string,
  isActive: boolean,
): Promise<AxiosResponse<ApiResponse<AuthUser>>> =>
  apiClient.patch<ApiResponse<AuthUser>>(`/admin/staff/${id}/active`, { isActive });

export const deleteHod = (id: string): Promise<AxiosResponse<ApiResponse<null>>> =>
  apiClient.delete<ApiResponse<null>>(`/admin/staff/${id}`);
