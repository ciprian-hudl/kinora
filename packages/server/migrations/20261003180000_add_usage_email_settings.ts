import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organization', (t) => {
    t.boolean('usage_near_email_enabled').notNullable().defaultTo(true)
    t.boolean('usage_limit_email_enabled').notNullable().defaultTo(true)
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('organization', (t) => {
    t.dropColumn('usage_limit_email_enabled')
    t.dropColumn('usage_near_email_enabled')
  })
}
