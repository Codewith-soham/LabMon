import type { AxiosResponse } from 'axios';
import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api';
import type { AuthUser, UserRole } from '../types/domain';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: string | null;
}

export interface VerifyEmailPayload {
  email: string;
  otp: string;
}

export interface ResendOtpPayload {
  email: string;
  purpose: string;
}

type AuthUserResponse = ApiResponse<{ user: AuthUser }>;
type EmptyResponse = ApiResponse<Record<string, never>>;

export const login = (
  credentials: LoginCredentials,
): Promise<AxiosResponse<AuthUserResponse>> =>
  apiClient.post<AuthUserResponse>('/auth/login', credentials);

export const register = (
  payload: RegisterPayload,
): Promise<AxiosResponse<ApiResponse<AuthUser>>> =>
  apiClient.post<ApiResponse<AuthUser>>('/auth/register', payload);

export const logout = (): Promise<AxiosResponse<EmptyResponse>> =>
  apiClient.post<EmptyResponse>('/auth/logout');

export const refresh = (): Promise<AxiosResponse<EmptyResponse>> =>
  apiClient.post<EmptyResponse>('/auth/refresh-token');

export const getCurrentUser = (): Promise<AxiosResponse<AuthUserResponse>> =>
  apiClient.get<AuthUserResponse>('/auth/me');

export const verifyEmailOtp = (
  payload: VerifyEmailPayload,
): Promise<AxiosResponse<ApiResponse<AuthUser>>> =>
  apiClient.post<ApiResponse<AuthUser>>('/auth/verify-email', payload);

export const resendOtp = (
  payload: ResendOtpPayload,
): Promise<AxiosResponse<ApiResponse<{ email: string }>>> =>
  apiClient.post<ApiResponse<{ email: string }>>('/auth/resend-otp', payload);
