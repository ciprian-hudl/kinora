import { expect, test } from '../fixtures'

test.use({ baseURL: 'https://ui.demo.kinora.dev' })

test('loading disables the button', async ({ page }) => {
  await page.goto('/stories/Button/Loading')
  const button = page.getByRole('button', { name: 'Save changes' })
  await button.click()

  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
})
