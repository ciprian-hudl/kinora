import { expect, test } from '../fixtures'

test.use({ baseURL: 'https://ui.demo.kinora.dev' })

test('error toast can be dismissed', async ({ page }) => {
  await page.goto('/stories/Toast/Error')
  await expect(page.getByRole('alert')).toContainText('Could not save your changes.')

  await page.getByRole('button', { name: 'Dismiss' }).click()

  await expect(page.getByRole('alert')).toBeHidden()
})
