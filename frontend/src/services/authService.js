import { apiClient } from './apiClient';

export const login = (credentials) => apiClient.post('/auth/login', credentials);

export const register = (payload) => apiClient.post('/auth/register', payload);

export const logout = () => apiClient.post('/auth/logout');

export const refresh = () => apiClient.post('/auth/refresh-token');

export const getCurrentUser = () => apiClient.get('/auth/me');

export const verifyEmailOtp = (payload) => apiClient.post('/auth/verify-email', payload);

export const verifyLoginOtp = (payload) => apiClient.post('/auth/verify-login-otp', payload);

// NOTE: the backend has no dedicated resend-otp route yet. Login OTPs can be
// re-issued by calling `login` again (registerUser re-runs issueOtp each time),
// but email-verification OTPs currently have no resend path — re-registering
// an existing email 409s. Add a backend `/auth/resend-otp` route before this
// will work for the signup verification screen.
export const resendOtp = (payload) => apiClient.post('/auth/resend-otp', payload);
