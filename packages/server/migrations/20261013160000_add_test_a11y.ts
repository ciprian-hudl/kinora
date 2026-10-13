import type { Knex } from 'knex'

// Accessibility report of a test (Storybook a11y addon): status + axe violations. Null when the
// test ran no a11y check.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('test', (t) => {
    t.jsonb('a11y')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('test', (t) => {
    t.dropColumn('a11y')
  })
}
