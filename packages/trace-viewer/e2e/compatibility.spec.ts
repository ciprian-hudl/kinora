import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const fixturesDir = fileURLToPath(new URL('../public/fixtures/', import.meta.url))
const traceFixtures = readdirSync(fixturesDir)
  .filter(file => file.endsWith('.zip'))
  .sort()

for (const fixture of traceFixtures) {
  test(`opens fixture ${fixture}`, async ({ page }) => {
    await page.goto(`/?trace=${encodeURIComponent(`fixtures/${fixture}`)}`)
    await expect(page.getByTestId('action').first()).toBeVisible()
    await expect(page.getByText('Failed to load trace')).toBeHidden()
  })
}
