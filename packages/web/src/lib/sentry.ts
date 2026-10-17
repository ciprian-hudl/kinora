// Content blockers drop requests whose URL carries `?sentry_key=`, which the SDK adds by default.
// Posting to the bare envelope URL works because the SDK also puts the DSN in the envelope header.
export function envelopeUrl(dsn: string): string {
  const { origin, pathname } = new URL(dsn)
  return `${origin}/api/${pathname.slice(1)}/envelope/`
}
