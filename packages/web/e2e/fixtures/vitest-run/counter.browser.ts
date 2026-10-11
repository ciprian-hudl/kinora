import { expect, test } from 'vitest'
import { page } from 'vitest/browser'

function render() {
  document.body.innerHTML = '<button>inc</button><output>0</output>'
  const output = document.querySelector('output')!
  document.querySelector('button')!.onclick = () => (output.textContent = String(Number(output.textContent) + 1))
}

test('counter increments', async () => {
  render()
  await page.getByRole('button', { name: 'inc' }).click()
  await expect.element(page.getByText('1')).toBeVisible()
})

test('counter fails on purpose', async () => {
  render()
  await expect.element(page.getByText('99'), { timeout: 300 }).toBeVisible()
})
