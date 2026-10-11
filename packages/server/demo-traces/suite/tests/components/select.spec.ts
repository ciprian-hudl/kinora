import { expect, test } from '../fixtures'

test.use({ baseURL: 'https://ui.demo.kinora.dev' })

test('searchable filters options', async ({ page }) => {
  await page.goto('/stories/Select/Searchable')
  await page.getByRole('combobox', { name: 'City' }).fill('li')

  await expect(page.getByRole('option')).toHaveText(['Berlin', 'Lisbon'])
  await page.getByRole('option', { name: 'Lisbon' }).click()
  await expect(page.getByRole('combobox', { name: 'City' })).toHaveValue('Lisbon')
})
