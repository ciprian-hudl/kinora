import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?trace=fixtures/demo.zip')
  await expect(page.getByTestId('action').first()).toBeVisible()
})

test('filmstrip tiles never overlap', async ({ page }) => {
  const tiles = page.getByTestId('filmstrip-tile')
  await expect(tiles.first()).toBeVisible()
  const boxes = await tiles.evaluateAll(els => els.map(el => el.getBoundingClientRect()).map(r => ({ left: r.left, right: r.right })))
  expect(boxes.length).toBeGreaterThan(1)
  for (let i = 1; i < boxes.length; i++)
    expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5)
})
