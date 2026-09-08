import { apiClient } from './apiClient';

export const login = (credentials) => apiClient.post('/auth/login', credentials);

export const register = (payload) => apiClient.post('/auth/register', payload);

export const logout = () => apiClient.post('/auth/logout');

export const refresh = () => apiClient.post('/auth/refresh-token');

export const getCurrentUser = () => apiClient.get('/auth/me');

export const verifyEmailOtp = (payload) => apiClient.post('/auth/verify-email', payload);

export const resendOtp = (payload) => apiClient.post('/auth/resend-otp', payload);
