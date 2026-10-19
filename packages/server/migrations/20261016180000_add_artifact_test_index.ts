import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('artifact', (t) => {
    t.index(['test_id'], 'artifact_testId_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('artifact', (t) => {
    t.dropIndex(['test_id'], 'artifact_testId_idx')
  })
}
