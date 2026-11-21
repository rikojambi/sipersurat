/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_SCOPES: string;
  readonly VITE_GOOGLE_PICKER_API_KEY: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_SCHOOL_CODE: string;
  readonly VITE_APP_URL: string;
  /** Pepper HMAC untuk kode aktivasi mandiri; wajib sama di semua perangkat. */
  readonly VITE_ACTIVATION_PEPPER: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
declare global { interface Window { google: any; gapi: any } }
export {};
