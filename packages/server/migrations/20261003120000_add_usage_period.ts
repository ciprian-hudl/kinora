import type { Knex } from 'knex'

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('usage_period', (t) => {
    t.text('organization_id').notNullable().references('id').inTable('organization').onDelete('CASCADE')
    t.text('period').notNullable()
    t.integer('results').notNullable().defaultTo(0)
    t.timestamp('updated_at', { useTz: false }).notNullable().defaultTo(knex.fn.now())
    t.primary(['organization_id', 'period'])
  })

  // Seed from the rows still in the database so current-month usage doesn't reset to zero on deploy.
  await knex.raw(`
    INSERT INTO usage_period (organization_id, period, results)
    SELECT p.organization_id, to_char(r.started_at, 'YYYY-MM'), count(*)::int
    FROM test t
    INNER JOIN run r ON r.id = t.run_id
    INNER JOIN project p ON p.id = t.project_id
    GROUP BY 1, 2
  `)
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('usage_period')
}
