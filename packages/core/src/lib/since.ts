const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const
export const DEFAULT_SINCE = '7d'
const MAX_WINDOW_MS = 90 * UNIT_MS.d

// The start of a time window: a span back from now (`24h`, `2d`, `1w`, `30m`) or an ISO date,
// at most 90 days back. Undefined for a value that is neither.
export function parseSince(value: string = DEFAULT_SINCE, now = Date.now()): Date | undefined {
  const span = /^(\d+)\s*([mhdw])$/i.exec(value.trim())
  const at = span
    ? now - Number(span[1]) * UNIT_MS[span[2].toLowerCase() as keyof typeof UNIT_MS]
    : Date.parse(value)
  if (Number.isNaN(at))
    return undefined
  return new Date(Math.max(at, now - MAX_WINDOW_MS))
}
