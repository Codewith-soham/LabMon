import { apiClient } from './apiClient';

export const listComplaints = () => apiClient.get('/complaint');
export const escalateComplaint = (id) => apiClient.patch(`/complaint/${id}/escalate`);
export const resolveComplaint = (id, remarks) => apiClient.patch(`/complaint/${id}/resolve`, { remarks });

// Public, login-free endpoints
export const raiseComplaint = (payload) => apiClient.post('/complaint', payload);
export const trackComplaint = (token) => apiClient.get(`/complaint/track/${token}`);
