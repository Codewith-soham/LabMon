import type { AxiosResponse } from 'axios';
import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api';
import type { Complaint, RaisedBy, TrackedComplaint } from '../types/domain';

export interface RaiseComplaintPayload {
  deadStockNo: string;
  description: string;
  raisedBy: RaisedBy;
}

export const listComplaints = (): Promise<AxiosResponse<ApiResponse<Complaint[]>>> =>
  apiClient.get<ApiResponse<Complaint[]>>('/complaint');

export const escalateComplaint = (
  id: string,
): Promise<AxiosResponse<ApiResponse<Complaint>>> =>
  apiClient.patch<ApiResponse<Complaint>>(`/complaint/${id}/escalate`);

export const resolveComplaint = (
  id: string,
  remarks?: string,
): Promise<AxiosResponse<ApiResponse<Complaint>>> =>
  apiClient.patch<ApiResponse<Complaint>>(`/complaint/${id}/resolve`, { remarks });

// Public, login-free endpoints
export const raiseComplaint = (
  payload: RaiseComplaintPayload,
): Promise<AxiosResponse<ApiResponse<Complaint>>> =>
  apiClient.post<ApiResponse<Complaint>>('/complaint', payload);

export const trackComplaint = (
  token: string,
): Promise<AxiosResponse<ApiResponse<TrackedComplaint>>> =>
  apiClient.get<ApiResponse<TrackedComplaint>>(`/complaint/track/${token}`);
