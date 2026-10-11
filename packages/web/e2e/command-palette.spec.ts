import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

async function openPalette(page: Page) {
  // The shortcut is only bound once the app shell is up.
  await expect(page.getByRole('button', { name: 'Search or jump to' })).toBeVisible()
  await page.keyboard.press('ControlOrMeta+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  return palette
}

test('jumps to a project from the keyboard', async ({ page }) => {
  const palette = await openPalette(page)
  await palette.getByRole('textbox').fill('gateway')
  await expect(palette.getByRole('option')).toHaveText([/API Gateway/])

  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/projects/api-gateway')
  await expect(palette).toBeHidden()
})

test('finds a test in any project and remembers it', async ({ page }) => {
  let palette = await openPalette(page)
  // Words match in any order, across the title and the project name.
  await palette.getByRole('textbox').fill('submits design')
  const hit = palette.getByRole('group', { name: 'Tests' }).getByRole('option')
  await expect(hit).toHaveText([/primary button submits.*Design System/])

  await hit.click()
  await expect(page).toHaveURL(/\/projects\/design-system\/test\?key=/)

  // Listed from any other page: the palette never offers the page you are on.
  await page.goto('/')
  palette = await openPalette(page)
  await expect(palette.getByRole('group', { name: 'Recent' }).getByRole('option')).toHaveText([/primary button submits/])
})

test('offers the current project shortcuts, and opens from the header', async ({ page }) => {
  await page.goto('/projects/web-app')
  await page.getByRole('button', { name: 'Search or jump to' }).click()
  const palette = page.getByRole('dialog', { name: 'Command palette' })

  const project = palette.getByRole('group', { name: 'Web App' })
  await expect(project.getByRole('option', { name: 'Per-test history' })).toBeVisible()
  await project.getByRole('option', { name: 'Latest run' }).click()
  await expect(page).toHaveURL(/\/projects\/web-app\/runs\//)

  // The run page adds its own commands.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(palette.getByRole('group', { name: 'This run' }).getByRole('option', { name: 'Copy the link to this run' })).toBeVisible()
})

test('says so when nothing matches', async ({ page }) => {
  const palette = await openPalette(page)
  await palette.getByRole('textbox').fill('zzzzzz')
  await expect(palette.getByText('No results.')).toBeVisible()
  await expect(palette.getByRole('option')).toHaveCount(0)
})
