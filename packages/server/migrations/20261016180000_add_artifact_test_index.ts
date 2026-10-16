import type { Knex } from 'knex'

// artifact.test_id cascades from test, so deleting a project (or a run) looks up attachments per deleted
// test row; without this each lookup seq-scans artifact and a big project's delete hits statement_timeout.
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
