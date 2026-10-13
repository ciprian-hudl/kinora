// `test` with kinora's `mount`: each mounted story is recorded on the test, which feeds the
// Components page. Users import this from `@kinora/reporter/ct`; in the repo that entry resolves
// to the reporter's build output, so the suite reads its source to run without a prior build.
import { scanA11y } from '../../reporter/src/a11y.ts'
import { test as base } from '../../reporter/src/ct.ts'

export { expect } from '../../reporter/src/ct.ts'

// Every mounted story also gets an axe scan, attached to the test and never asserted: its
// violations reach kinora as warnings (the nightly uploads this suite), where the Components
// page ranks the components by them. Scoped to the story: the gallery page around it is not
// what ships. `region` asks for a landmark, which a lone component has no reason to carry.
export const test = base.extend({
  mount: async ({ mount, page }, use, testInfo) => {
    // The visual tests mount the same stories: scanning them too would only repeat the results.
    if (testInfo.project.name !== 'components')
      return use(mount)
    // `mount` is overloaded, so the wrapper is typed loosely and cast back.
    const plain = mount as (...args: unknown[]) => Promise<unknown>
    await use((async (...args: unknown[]) => {
      const component = await plain(...args)
      await scanA11y(page, axe => axe.include('#root').disableRules(['region']))
      return component
    }) as typeof mount)
  },
})
