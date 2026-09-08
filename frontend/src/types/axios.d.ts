import 'axios';

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    /**
     * Set by the response interceptor so a request that 401s is retried at most
     * once after a token refresh.
     */
    _retried?: boolean;
  }
}
