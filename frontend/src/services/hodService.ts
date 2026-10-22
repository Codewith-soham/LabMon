import type { AxiosResponse } from 'axios';
import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api';
import type { AuthUser } from '../types/domain';

export interface CreateLabInchargePayload {
  name: string;
  email: string;
  password: string;
}

export const listLabIncharges = (): Promise<AxiosResponse<ApiResponse<AuthUser[]>>> =>
  apiClient.get<ApiResponse<AuthUser[]>>('/hod/staff');

export const createLabIncharge = (
  payload: CreateLabInchargePayload,
): Promise<AxiosResponse<ApiResponse<AuthUser>>> =>
  apiClient.post<ApiResponse<AuthUser>>('/hod/staff', payload);

export const toggleLabInchargeActive = (
  id: string,
  isActive: boolean,
): Promise<AxiosResponse<ApiResponse<AuthUser>>> =>
  apiClient.patch<ApiResponse<AuthUser>>(`/hod/staff/${id}/active`, { isActive });

export const deleteLabIncharge = (
  id: string,
): Promise<AxiosResponse<ApiResponse<null>>> =>
  apiClient.delete<ApiResponse<null>>(`/hod/staff/${id}`);
