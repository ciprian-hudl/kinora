import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('test_quarantine', (t) => {
    t.text('id').primary()
    t.text('project_id').notNullable().references('id').inTable('project').onDelete('CASCADE')
    t.text('test_key').notNullable()
    t.text('reason')
    t.timestamp('expires_at', { useTz: false })
    t.text('created_by_user_id').references('id').inTable('user').onDelete('SET NULL')
    t.text('updated_by_user_id').references('id').inTable('user').onDelete('SET NULL')
    t.timestamp('created_at', { useTz: false }).notNullable().defaultTo(knex.fn.now())
    t.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(knex.fn.now())
    t.index(['project_id'], 'test_quarantine_projectId_idx')
    t.unique(['project_id', 'test_key'], { indexName: 'test_quarantine_project_key_uniq' })
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('test_quarantine')
}
