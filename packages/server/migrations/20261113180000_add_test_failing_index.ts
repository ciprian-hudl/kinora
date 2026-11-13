import type { Knex } from 'knex'

// Failure clusters read a window's failing tests; without this they seq-scan every project's tests.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('test', (t) => {
    t.index(['run_id'], 'test_failing_run_idx', { predicate: knex.whereRaw('status in (\'unexpected\', \'flaky\')') })
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('test', (t) => {
    t.dropIndex(['run_id'], 'test_failing_run_idx')
  })
}
