/// <reference types="vite/client" />

declare const __DEMO_TRACE_VERSION__: string
// Sentry release name, injected by vite.config.ts (`define`).
declare const __KINORA_RELEASE__: string

interface ImportMetaEnv {
  readonly VITE_KINORA_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
