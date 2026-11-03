import type { Knex } from 'knex'

// The okta fork already shipped this index as 20261016180000_add_artifact_test_index, so it may exist.
export async function up(knex: Knex): Promise<void> {
  await knex.raw('create index if not exists "artifact_testId_idx" on "artifact" ("test_id")')
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('drop index if exists "artifact_testId_idx"')
}
