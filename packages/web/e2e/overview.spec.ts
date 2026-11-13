import { expect, test } from '@playwright/test'
import { createApiToken, login, postRun, runOf, scanPage, testOf } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('lists the seeded projects', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Web App' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'API Gateway' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Marketing Site' })).toBeVisible()
  await scanPage(page)
})

test('filters the overview by tag', async ({ page }) => {
  await page.goto('/?tag=@smoke')
  // Only Web App carries @smoke-tagged tests in the seed.
  await expect(page.getByRole('link', { name: 'Web App' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'API Gateway' })).toHaveCount(0)
  await expect(page.getByText('@smoke / latest')).toBeVisible()
})

test('a failed filter change keeps the filters', async ({ page }) => {
  await page.goto('/?tag=@smoke')
  await expect(page.getByRole('link', { name: 'Web App' })).toBeVisible()

  await page.route('**/trpc/dashboard.overview**', route => route.abort())
  await page.getByRole('button', { name: 'Clear' }).click()

  const alert = page.getByRole('alert')
  await expect(alert.getByText('Can\'t reach the kinora server.')).toBeVisible()
  await expect(page.getByRole('combobox').filter({ hasText: 'All branches' })).toBeVisible()

  await page.unroute('**/trpc/dashboard.overview**')
  await alert.getByRole('button', { name: 'Retry' }).click()

  await expect(page.getByRole('link', { name: 'API Gateway' })).toBeVisible()
})

test('a saved view filters by project, links, and comes back next visit', async ({ page, context }) => {
  const stamp = Date.now()
  const token = await createApiToken(page)
  const tests = [testOf('a.spec.ts', 'works', 'expected')]
  await postRun(page, token, runOf(`views-${stamp}/hfe-app`, new Date(), tests))
  await postRun(page, token, runOf(`views-${stamp}/hudl-ui`, new Date(), tests))
  const hfe = page.getByRole('link', { name: `views-${stamp}/hfe-app` })
  const marvel = page.getByRole('link', { name: `views-${stamp}/hudl-ui` })

  await page.goto('/')
  await page.getByRole('textbox', { name: 'Filter projects' }).fill(`views-${stamp}/hudl-*`)
  await expect(marvel).toBeVisible()
  await expect(hfe).toHaveCount(0)

  await page.getByRole('button', { name: 'Save view' }).click()
  await page.getByRole('textbox', { name: 'View name' }).fill('Marvel')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page).toHaveURL(/[?&]view=marvel/)
  await expect(page.getByRole('radio', { name: 'marvel' })).toBeChecked()
  const link = page.url()

  await page.goto('/')
  await expect(page).toHaveURL(/[?&]view=marvel/)
  await expect(hfe).toHaveCount(0)
  await page.getByRole('radio', { name: 'All' }).click()
  await expect(hfe).toBeVisible()
  await scanPage(page)

  const other = await context.browser()!.newContext({ storageState: { cookies: (await context.storageState()).cookies, origins: [] } })
  const peer = await other.newPage()
  await peer.goto(link)
  await expect(peer.getByRole('radio', { name: 'marvel' })).toBeChecked()
  await expect(peer.getByRole('link', { name: `views-${stamp}/hfe-app` })).toHaveCount(0)
  await expect(peer.getByRole('link', { name: `views-${stamp}/hudl-ui` })).toBeVisible()
  await other.close()
})
