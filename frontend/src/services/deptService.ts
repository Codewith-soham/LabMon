import { apiClient } from './apiClient';

export const listDepartments = () => apiClient.get('/dept');
