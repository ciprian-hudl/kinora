import { expect, test } from '@playwright/test'
import { scanA11y } from '../../../../reporter/src/a11y'

// A page with one accessibility problem: a button without an accessible name.
const PAGE = `<!doctype html><html lang="en"><head><title>Checkout</title></head>
<body><main><h1>Checkout</h1><button id="pay"></button></main></body></html>`

// Scanned without asserting: the violation is a warning, the test passes.
test('checkout renders', async ({ page }) => {
  await page.setContent(PAGE)
  await scanA11y(page)
  await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
})

// Asserted: the same violation fails the test.
test('checkout has no accessibility violation', async ({ page }) => {
  await page.setContent(PAGE)
  const { violations } = await scanA11y(page)
  expect(violations).toEqual([])
})
