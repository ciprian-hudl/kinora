import { expect, test } from '@playwright/test'

test('checkout asks for a card', async ({ page }) => {
  await page.setContent('<main><h1>Checkout</h1><label>Card <input name="card"></label></main>')
  await expect(page.getByLabel('Card')).toBeVisible()
})
