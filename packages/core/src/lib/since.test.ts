import { describe, expect, it } from 'vitest'
import { parseSince } from './since'

const NOW = Date.parse('2026-11-13T12:00:00Z')

describe('parseSince', () => {
  it('reads a span back from now', () => {
    expect(parseSince('24h', NOW)?.toISOString()).toBe('2026-11-12T12:00:00.000Z')
    expect(parseSince('2d', NOW)?.toISOString()).toBe('2026-11-11T12:00:00.000Z')
    expect(parseSince('1W', NOW)?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
    expect(parseSince('30m', NOW)?.toISOString()).toBe('2026-11-13T11:30:00.000Z')
  })

  it('reads an ISO date and defaults to a week', () => {
    expect(parseSince('2026-11-10', NOW)?.toISOString()).toBe('2026-11-10T00:00:00.000Z')
    expect(parseSince(undefined, NOW)?.toISOString()).toBe('2026-11-06T12:00:00.000Z')
  })

  it('caps the window at 90 days and rejects anything else', () => {
    expect(parseSince('1000d', NOW)?.toISOString()).toBe('2026-08-15T12:00:00.000Z')
    expect(parseSince('yesterday', NOW)).toBeUndefined()
  })
})
