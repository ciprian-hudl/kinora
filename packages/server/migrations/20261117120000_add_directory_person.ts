import type { Knex } from 'knex'

// The squads of each person in the org's ownership directory, by email, so a page reads the
// viewer's squads with one key lookup and every server instance shares the same answer.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('directory_person', (t) => {
    t.text('email').primary()
    t.jsonb('squads').notNullable().defaultTo('[]')
    t.timestamp('synced_at').notNullable()
    // The directory's age is its newest sync, and a sync drops the people older than it.
    t.index('synced_at', 'directory_person_synced_idx')
  })
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('directory_person')
}
