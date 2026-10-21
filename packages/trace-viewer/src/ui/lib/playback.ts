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

export function advance(t: number, elapsedMs: number, speed: number, end: number): number {
  return Math.min(end, t + Math.max(0, elapsedMs) * speed)
}
