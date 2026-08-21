import { apiClient } from './apiClient';

export const searchPcs = (params) => apiClient.get('/pc/search', { params });

// Public — confirms a dead stock number is real and shows its department/lab.
export const lookupPc = (deadStockNo) => apiClient.get(`/pc/lookup/${encodeURIComponent(deadStockNo)}`);

// Intentionally POST, not GET — matches the backend route as it exists today.
export const getPcHealthCard = (id) => apiClient.post(`/pc/${id}/health-card`);
