/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the LABMON backend API. Falls back to http://localhost:8000/api/v1. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
