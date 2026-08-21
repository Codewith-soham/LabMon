import { apiClient } from './apiClient';

export const searchPcs = (params) => apiClient.get('/pc/search', { params });

// Intentionally POST, not GET — matches the backend route as it exists today.
export const getPcHealthCard = (id) => apiClient.post(`/pc/${id}/health-card`);
