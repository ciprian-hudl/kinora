import { expect, test } from '@playwright/test'

// error-trace.zip is a failing run: it carries an `error-context` attachment,
// which powers the Errors tab "Copy prompt" button (LLM prompt).
test.beforeEach(async ({ page }) => {
  await page.goto('/?trace=fixtures/error-trace.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
  await page.getByRole('button', { name: /^Errors/ }).click()
})

test('Errors tab offers Copy prompt for a trace with error-context', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Copy prompt' })).toBeVisible()
})

test('Errors tab reveals the failing source line', async ({ page }) => {
  await page.getByRole('button', { name: 'Reveal in source' }).click()

  await expect(page.getByRole('button', { name: 'Source' })).toHaveClass(/text-foreground/)
  await expect(page.getByText('fail.spec.ts:5')).toBeVisible()
  await expect(page.getByText('Pay now')).toBeVisible()
  await expect(page.locator('.cm-targetLine')).toBeVisible()
})
