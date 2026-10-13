import type AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'

export type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>

// The name Playwright's accessibility guide uses. kinora reads the scan by its content, so any
// name works; this one keeps it recognizable in other reports.
export const A11Y_ATTACHMENT = 'accessibility-scan-results'

/**
 * Scans the page with axe (`@axe-core/playwright`) and attaches the result to the running test,
 * which is where kinora reads it: without the attachment, a reporter only sees the test fail.
 *
 * Returns axe's result. Assert on `violations` to fail the test on them, or leave them be to
 * record them as warnings. `configure` narrows or widens the scan, e.g.
 * `axe => axe.withTags(['wcag2a', 'wcag2aa'])`.
 */
export async function scanA11y(page: Page, configure?: (axe: AxeBuilder) => AxeBuilder): Promise<AxeResults> {
  const { default: Axe } = await import('@axe-core/playwright').catch(() => {
    throw new Error('scanA11y needs @axe-core/playwright: add it to your dev dependencies.')
  })
  const axe = new Axe({ page })
  const results = await (configure?.(axe) ?? axe).analyze()
  await test.info().attach(A11Y_ATTACHMENT, { body: JSON.stringify(results), contentType: 'application/json' })
  return results
}
