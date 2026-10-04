import { describe, expect, it } from 'vitest'
import { formatBytes, money } from './format'

describe('formatBytes', () => {
  it('scales to the largest fitting unit', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(250 * 1024 ** 3)).toBe('250 GB')
  })
})

describe('money', () => {
  it('formats cents, keeping sub-cent unit prices', () => {
    expect(money(14900, 'usd')).toBe('$149.00')
    expect(money(0.4, 'usd')).toBe('$0.004')
  })
})
