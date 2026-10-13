import { expect, test } from '@playwright/test'
import { findFailingRun, findTwoRuns, login, scanPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('tests page surfaces windowed flakiness stats', async ({ page }) => {
  const { slug } = await findTwoRuns(page)
  await page.goto(`/projects/${slug}/tests`)

  await expect(page.getByText('New flakiness').first()).toBeVisible()
  await expect(page.getByText('New failures').first()).toBeVisible()
  await expect(page.getByText(/over the last \d+ runs/).first()).toBeVisible()
  await scanPage(page)
})

test('tests page filters flaky and broken tests', async ({ page }) => {
  const { slug } = await findTwoRuns(page)
  await page.goto(`/projects/${slug}/tests`)

  await page.getByRole('button', { name: 'Broken', exact: true }).click()
  await expect(page).toHaveURL(/show=broken/)
  await expect(page.locator('[data-health="flaky"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Flaky', exact: true }).click()
  await expect(page).toHaveURL(/show=flaky/)
  await expect(page.locator('[data-health="broken"]')).toHaveCount(0)
})

test('tests page reads links shared before flaky / broken', async ({ page }) => {
  const { slug } = await findTwoRuns(page)
  await page.goto(`/projects/${slug}/tests?unstable=false`)

  await expect(page).toHaveURL(/show=all/)
  await expect(page).not.toHaveURL(/unstable=/)
  await expect(page.getByRole('button', { name: 'All tests' })).toHaveClass(/border-foreground/)
})

test('tests page groups failures into top failure causes', async ({ page }) => {
  const { slug } = await findFailingRun(page)
  await page.goto(`/projects/${slug}/tests`)

  await expect(page.getByText('Top failure causes')).toBeVisible()
  // Expanding a cluster reveals its sample and the tests it hits.
  await page.getByRole('button', { name: /\d+ tests?/ }).first().click()
  await expect(page.getByText(/Affected tests?/).first()).toBeVisible()
})
