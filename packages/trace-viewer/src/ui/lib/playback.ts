// Index of the last entry at or before `t` in a time-sorted list (0 when `t` precedes them all, -1 when empty).
export function indexAt<T>(entries: readonly T[], t: number, time: (entry: T) => number): number {
  if (!entries.length)
    return -1
  let lo = 0
  let hi = entries.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (time(entries[mid]) <= t)
      lo = mid
    else
      hi = mid - 1
  }
  return lo
}

// Real-time playback clock: moves `elapsedMs * speed` along the trace's own timeline, capped at `end`.
export function advance(t: number, elapsedMs: number, speed: number, end: number): number {
  return Math.min(end, t + Math.max(0, elapsedMs) * speed)
}
