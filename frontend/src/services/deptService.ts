import type { AxiosResponse } from 'axios';
import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api';
import type { Department } from '../types/domain';

export const listDepartments = (): Promise<AxiosResponse<ApiResponse<Department[]>>> =>
  apiClient.get<ApiResponse<Department[]>>('/dept');
