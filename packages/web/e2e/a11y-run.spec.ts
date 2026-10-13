import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, test } from '@playwright/test'
import { createApiToken, login, SERVER_URL } from './helpers'

const run = promisify(execFile)
const PLAYWRIGHT_CLI = createRequire(import.meta.url).resolve('@playwright/test/cli')
const CONFIG = fileURLToPath(new URL('./fixtures/a11y-run/playwright.config.ts', import.meta.url))

// The Playwright a11y path end to end, nothing seeded: axe scans attached by `scanA11y` ->
// @kinora/reporter -> upload -> server -> Tests page. Real axe output, so a change in its shape
// (or in how Playwright hands attachments to reporters) fails here.
test('axe scans of a real Playwright run show up with their violations', async ({ page }) => {
  await login(page)
  const slug = `a11y-run-${Date.now()}`
  const outputDir = await mkdtemp(join(tmpdir(), 'kinora-a11y-'))

  try {
    // One test asserts on the violations and fails on purpose, so Playwright exits non-zero.
    const { stdout } = await run(process.execPath, [PLAYWRIGHT_CLI, 'test', '-c', CONFIG], {
      env: { ...process.env, KINORA_URL: SERVER_URL, KINORA_TOKEN: await createApiToken(page), A11Y_PROJECT_SLUG: slug, A11Y_OUTPUT_DIR: outputDir },
    }).catch((error: { stdout: string }) => error)
    expect(stdout).toContain('[kinora] uploaded 4 tests')
  }
  finally {
    await rm(outputDir, { recursive: true, force: true })
  }

  // Three of the four tests scanned a page with a violation, all in one file: one hotspot.
  await page.goto(`/projects/${slug}/tests?show=all`)
  const rows = page.getByRole('link').filter({ hasText: 'checkout.a11y.ts' })
  await expect(rows).toHaveCount(4)
  await expect(page.locator('[data-a11y]')).toHaveCount(3)

  // The hotspot narrows the list to the tests of its file that break a rule.
  await page.getByRole('region', { name: 'Accessibility hotspots' }).getByRole('button', { name: /checkout\.a11y\.ts/ }).click()
  await expect(page).toHaveURL(/a11y=true/)
  await expect(rows).toHaveCount(3)
  await expect(page.getByRole('link', { name: /checkout has a title/ })).toHaveCount(0)
  // And the filter button gives the full list back.
  await page.getByRole('button', { name: /A11y issues/ }).click()
  await expect(page.getByRole('link', { name: /checkout has a title/ })).toBeVisible()

  // Scanned but not asserted: a warning on a passing test, with axe's impact and the element.
  await page.getByRole('link', { name: /checkout renders/ }).click()
  const warning = page.getByTestId('a11y-violations')
  await expect(warning).toContainText('1 violation, reported as a warning')
  await expect(warning.getByRole('listitem')).toContainText('Critical')
  await expect(warning.getByRole('link', { name: 'button-name' })).toHaveAttribute('href', /^https:\/\/dequeuniversity\.com\/rules\/axe\//)
  await expect(warning).toContainText('#pay')

  // Asserted: the test failed, and the violation keeps its impact (the scan was attached first).
  await page.goto(`/projects/${slug}/tests?show=all`)
  await page.getByRole('link', { name: /checkout has no accessibility violation/ }).click()
  const failed = page.getByTestId('a11y-violations')
  await expect(failed).toContainText('1 violation failed the test')
  await expect(failed.getByRole('listitem')).toContainText('Critical')

  // Attached by hand under another name: read all the same.
  await page.goto(`/projects/${slug}/tests?show=all`)
  await page.getByRole('link', { name: /product page shows the picture/ }).click()
  const byHand = page.getByTestId('a11y-violations')
  await expect(byHand.getByRole('link', { name: 'image-alt' })).toBeVisible()
  await expect(byHand).toContainText('#picture')
})
