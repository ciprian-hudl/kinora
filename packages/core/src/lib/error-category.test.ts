import { describe, expect, it } from 'vitest'
import { errorCategory } from './error-category'

describe('errorCategory', () => {
  it.each([
    ['Error: Timed out 5000ms waiting for expect(locator).toBeVisible()', 'locator-timeout'],
    ['TimeoutError: locator.click: Timeout 30000ms exceeded.', 'locator-timeout'],
    ['Test timeout of 30000ms exceeded.', 'timeout'],
    ['page.goto: Timeout 30000ms exceeded. navigating to "https://x/"', 'navigation'],
    ['Error: page.goto: net::ERR_CONNECTION_REFUSED at https://x/', 'network'],
    ['Error: connect ECONNREFUSED 127.0.0.1:3000', 'network'],
    ['Error: Request failed with status code 503', 'network'],
    ['Error: Could not discover the static-asset base: GET /admin/augmentation returned 502. The session timed out', 'network'],
    ['\u001B[31mError: 504 Gateway Timeout\u001B[39m', 'network'],
    ['Error: page.click: Target page, context or browser has been closed', 'browser-closed'],
    ['Error: 401 Unauthorized', 'auth'],
    ['Error: expect(received).toBe(expected)\n\nExpected: 2\nReceived: 3', 'assertion'],
    ['TypeError: cannot read properties of undefined', 'other'],
  ])('%s is %s', (message, category) => {
    expect(errorCategory(message)).toBe(category)
  })
})
