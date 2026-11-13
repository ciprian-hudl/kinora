import { stripAnsi } from './ansi'

// What kind of failure an error is, from its message: each kind points at a different fix.
export const ERROR_CATEGORIES = ['locator-timeout', 'timeout', 'assertion', 'network', 'navigation', 'browser-closed', 'auth', 'other'] as const
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

const LOCATOR = /locator|selector|getBy\w+|toBeVisible|toBeHidden|toHaveText|toBeEnabled|toBeChecked|waiting for element|strict mode violation/i
const TIMEOUT = /timed?\s?out|exceeded while waiting/i
const NETWORK = /net::ERR_|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|connection refused|\b5\d\d(?: \w+)? (?:status|response|error)|(?:status(?: code)?:?|returned|responded with) 5\d\d|Bad Gateway|Service Unavailable|Gateway Timeout|Internal Server Error/i
const NAVIGATION = /page\.goto|navigation|net::ERR_ABORTED|frame was detached/i
const BROWSER_CLOSED = /(?:target|page|context|browser)(?: page, context or browser)? has been closed|browser has disconnected|crashed/i
const AUTH = /\b40[13]\b|unauthori[sz]ed|forbidden|not logged in|sign[- ]?in required/i
const ASSERTION = /expect\(|AssertionError|toBe\(|toEqual\(|toMatch|toContain|toHaveLength|expected .* to /i

export function errorCategory(message: string): ErrorCategory {
  const text = stripAnsi(message)
  if (BROWSER_CLOSED.test(text))
    return 'browser-closed'
  if (NETWORK.test(text))
    return 'network'
  if (AUTH.test(text))
    return 'auth'
  if (TIMEOUT.test(text))
    return LOCATOR.test(text) ? 'locator-timeout' : NAVIGATION.test(text) ? 'navigation' : 'timeout'
  if (NAVIGATION.test(text))
    return 'navigation'
  if (ASSERTION.test(text))
    return 'assertion'
  return 'other'
}
