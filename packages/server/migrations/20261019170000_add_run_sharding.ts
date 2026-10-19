import type { Knex } from 'knex'

// Direct shard uploads grouped into one run: the CI run's group key, the shard slots filled so far
// and the run's completion state. Existing runs are single uploads, hence `complete`.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('run', (t) => {
    t.text('group_key')
    t.integer('shards_total')
    t.jsonb('shards_landed').notNullable().defaultTo('{}')
    t.text('status').notNullable().defaultTo('complete')
    t.timestamp('notified_at', { useTz: false })
  })
  await knex.schema.alterTable('test', (t) => {
    t.integer('shard_index')
  })
  await knex.raw('CREATE UNIQUE INDEX run_project_groupkey_uniq ON run (project_id, group_key) WHERE group_key IS NOT NULL')
  await knex.raw('CREATE INDEX run_open_idx ON run (created_at) WHERE status = \'open\'')
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS run_open_idx')
  await knex.raw('DROP INDEX IF EXISTS run_project_groupkey_uniq')
  await knex.schema.alterTable('test', (t) => {
    t.dropColumn('shard_index')
  })
  await knex.schema.alterTable('run', (t) => {
    t.dropColumn('notified_at')
    t.dropColumn('status')
    t.dropColumn('shards_landed')
    t.dropColumn('shards_total')
    t.dropColumn('group_key')
  })
}
