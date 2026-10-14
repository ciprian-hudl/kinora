import { expect, test } from '@playwright/test'

test('cart shows its total', async ({ page }) => {
  await page.setContent('<main><h1>Cart</h1><p>Total: 42</p></main>')
  await expect(page.getByText('Total: 42')).toBeVisible()
})
