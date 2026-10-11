import { expect, test } from '../fixtures'

test.use({ baseURL: 'https://ui.demo.kinora.dev' })

test('confirm closes on accept', async ({ page }) => {
  await page.goto('/stories/Dialog/Confirm')
  await page.getByRole('button', { name: 'Delete project' }).click()
  await expect(page.getByRole('alertdialog', { name: 'Delete this project?' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByRole('status')).toHaveText('Project deleted')
})
