import { describe, expect, it } from 'vitest'
import { envelopeUrl } from './sentry'

describe('envelopeUrl', () => {
  it('builds the envelope endpoint without the public key', () => {
    expect(envelopeUrl('https://abc123@errors.example.com/42')).toBe('https://errors.example.com/api/42/envelope/')
  })
})
