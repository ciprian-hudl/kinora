import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('run', (t) => {
    t.boolean('meter_pending').notNullable().defaultTo(false)
  })
  // Pending rows are rare and short-lived: a partial index keeps the retry scan off the full table.
  await knex.raw('CREATE INDEX run_meter_pending_idx ON run (created_at) WHERE meter_pending')
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS run_meter_pending_idx')
  await knex.schema.alterTable('run', (t) => {
    t.dropColumn('meter_pending')
  })
}
