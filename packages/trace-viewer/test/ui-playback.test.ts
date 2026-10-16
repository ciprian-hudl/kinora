import { describe, expect, it } from 'vitest'
import { advance, indexAt } from '../src/ui/lib/playback'

const at = (n: number) => n

describe('indexAt', () => {
  it('is -1 for an empty list', () => {
    expect(indexAt([], 10, at)).toBe(-1)
  })

  it('picks the last entry at or before t', () => {
    const times = [0, 100, 250, 900]
    expect(indexAt(times, 0, at)).toBe(0)
    expect(indexAt(times, 99, at)).toBe(0)
    expect(indexAt(times, 100, at)).toBe(1)
    expect(indexAt(times, 600, at)).toBe(2)
    expect(indexAt(times, 5_000, at)).toBe(3)
  })

  it('falls back to the first entry before the timeline starts', () => {
    expect(indexAt([50, 60], 10, at)).toBe(0)
  })

  it('keeps the last of entries sharing a timestamp', () => {
    expect(indexAt([0, 100, 100, 200], 150, at)).toBe(2)
  })
})

describe('advance', () => {
  it('moves in real time scaled by speed', () => {
    expect(advance(1_000, 16, 1, 10_000)).toBe(1_016)
    expect(advance(1_000, 16, 2, 10_000)).toBe(1_032)
    expect(advance(1_000, 16, 0.5, 10_000)).toBe(1_008)
  })

  it('stops at the end and never moves backwards', () => {
    expect(advance(9_990, 100, 1, 10_000)).toBe(10_000)
    expect(advance(1_000, -5, 1, 10_000)).toBe(1_000)
  })
})
