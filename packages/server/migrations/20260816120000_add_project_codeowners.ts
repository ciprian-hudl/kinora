import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('project', (t) => {
    t.text('codeowners_source').notNullable().defaultTo('manual')
    t.text('codeowners_text')
    t.timestamp('codeowners_synced_at', { useTz: false })
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('project', (t) => {
    t.dropColumn('codeowners_synced_at')
    t.dropColumn('codeowners_text')
    t.dropColumn('codeowners_source')
  })
}
