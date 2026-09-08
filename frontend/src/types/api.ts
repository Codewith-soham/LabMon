import axios from 'axios';

// Standard success envelope returned by every backend endpoint
// (backend/src/utils/ApiResponse.ts).
export interface ApiResponse<T> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;
}

// Error envelope returned by the backend error middleware
// (backend/src/middlewares/error.middleware.ts).
export interface ApiErrorBody {
  success: false;
  statusCode: number;
  message: string;
  errors: unknown[];
}

// Narrow an unknown thrown value to the backend's error message, matching the
// `err.response?.data?.message || fallback` pattern used across the UI.
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<Partial<ApiErrorBody>>(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return fallback;
}
