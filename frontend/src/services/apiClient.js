import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Access token lives in an httpOnly cookie, so a 401 usually means it expired.
// Refresh once (the refresh token cookie carries that call) and retry the original
// request; if the refresh itself fails, give up so the caller can redirect to login.
let refreshPromise = null;

// These endpoints legitimately 401 for reasons unrelated to session expiry (wrong
// password, wrong OTP, etc.) — a refresh attempt there just replaces the real error
// with a confusing "Refresh token missing" one, since no session exists yet.
const AUTH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/verify-login-otp',
  '/auth/resend-otp',
  '/auth/refresh-token',
];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => config.url?.includes(p));

    if (response?.status !== 401 || config._retried || isAuthEndpoint) {
      return Promise.reject(error);
    }
    config._retried = true;

    try {
      refreshPromise ??= apiClient.post('/auth/refresh-token').finally(() => {
        refreshPromise = null;
      });
      await refreshPromise;
      return apiClient(config);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);
