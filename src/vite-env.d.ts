/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional override for the Gemini server base URL (ends in /v1). */
  readonly VITE_AI_PROXY_URL?: string;
}
