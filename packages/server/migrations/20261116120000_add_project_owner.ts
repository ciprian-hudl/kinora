import type { Knex } from 'knex'

// Who owns each project, resolved from the org's ownership directory and cached here, so reads
// never wait on the directory and keep the last answer when it is down.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('project_owner', (t) => {
    t.text('project_id').primary().references('id').inTable('project').onDelete('cascade')
    t.text('squad')
    t.text('slack_channel')
    t.text('slack_channel_id')
    t.jsonb('member_emails').notNullable().defaultTo('[]')
    t.text('source')
    t.timestamp('resolved_at').notNullable()
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('project_owner')
}
