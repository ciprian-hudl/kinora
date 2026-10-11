import { expect, it } from 'vitest'
import { page } from 'vitest/browser'

declare const __SWATCH__: string

// contract.test.mjs records the reference with one color, then runs again with another, so the
// assertion fails with reference, actual and diff images on any OS.
it('swatch matches its reference', async () => {
  document.body.innerHTML = `<div data-testid="swatch" style="width:120px;height:40px;background:${__SWATCH__}"></div>`
  await expect.element(page.getByTestId('swatch')).toMatchScreenshot('swatch')
})
