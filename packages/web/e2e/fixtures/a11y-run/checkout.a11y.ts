import AxeBuilder from '@axe-core/playwright'
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

// Scanned and attached by hand, under a name of the author's choosing, as Playwright's guide shows:
// kinora tells the scan by its content.
test('product page shows the picture', async ({ page }, testInfo) => {
  await page.setContent(`<!doctype html><html lang="en"><head><title>Product</title></head>
<body><main><h1>Mug</h1><img id="picture" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main></body></html>`)
  const results = await new AxeBuilder({ page }).analyze()
  await testInfo.attach('product scan', { body: JSON.stringify(results), contentType: 'application/json' })
  await expect(page.getByRole('heading', { name: 'Mug' })).toBeVisible()
})

// No scan: no accessibility check on this one.
test('checkout has a title', async ({ page }) => {
  await page.setContent(PAGE)
  await expect(page).toHaveTitle('Checkout')
})
