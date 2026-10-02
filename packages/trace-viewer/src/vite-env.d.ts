/// <reference types="vite/client" />

declare const __DEMO_TRACE_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_KINORA_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
