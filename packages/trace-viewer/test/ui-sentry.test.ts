import type { ErrorEvent } from '@sentry/vue'
import { describe, expect, it } from 'vitest'
import { scrubBreadcrumb, scrubEvent, stripQuery } from '../src/ui/lib/sentry'

const SIGNED = 'https://app.kinora.dev/trace/?trace=https%3A%2F%2Fapi.kinora.dev%2Fartifacts%2Fa.zip%3Fexp%3D1%26sig%3Dabc'

describe('stripQuery', () => {
  it('drops the query string and hash', () => {
    expect(stripQuery(SIGNED)).toBe('https://app.kinora.dev/trace/')
    expect(stripQuery('http://127.0.0.1:5000/trace/#x?trace=y')).toBe('http://127.0.0.1:5000/trace/')
  })

  it('leaves a bare url untouched', () => {
    expect(stripQuery('https://app.kinora.dev/trace/')).toBe('https://app.kinora.dev/trace/')
  })
})

describe('scrubEvent', () => {
  it('removes the trace location from the request', () => {
    const event = scrubEvent({ type: undefined, request: { url: SIGNED, query_string: 'trace=secret' } } as ErrorEvent)
    expect(event.request).toEqual({ url: 'https://app.kinora.dev/trace/' })
  })

  it('passes through an event without a request', () => {
    expect(scrubEvent({ type: undefined, message: 'boom' } as ErrorEvent)).toEqual({ type: undefined, message: 'boom' })
  })
})

describe('scrubBreadcrumb', () => {
  it('strips fetch and navigation urls', () => {
    expect(scrubBreadcrumb({ category: 'fetch', data: { url: 'http://127.0.0.1:5000/file?path=/Users/me/trace.zip', status_code: 206 } }).data)
      .toEqual({ url: 'http://127.0.0.1:5000/file', status_code: 206 })
    expect(scrubBreadcrumb({ category: 'navigation', data: { from: '/trace/?trace=a', to: '/trace/?trace=b' } }).data)
      .toEqual({ from: '/trace/', to: '/trace/' })
  })

  it('passes through a breadcrumb without data', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'hi' })).toEqual({ category: 'console', message: 'hi' })
  })
})
