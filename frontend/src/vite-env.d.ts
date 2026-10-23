/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" keeps the `?mock=1` fixtures in a production build. */
  readonly VITE_MOCKS?: string;
}
