import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('subscription', (t) => {
    t.text('usage_alert_level')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('subscription', (t) => {
    t.dropColumn('usage_alert_level')
  })
}
