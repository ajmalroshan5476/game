import { pool } from './pool.js';
import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';

export async function resetDatabase() {
  const client = await pool.connect();
  try {
    console.log('Clearing all existing database tables and data...');
    await client.query('BEGIN');

    // Truncate all tables cleanly with CASCADE
    await client.query(`
      TRUNCATE TABLE 
        audit_logs,
        settlements,
        financial_ledger,
        winning_records,
        official_results,
        ticket_entries,
        tickets,
        number_limit_counters,
        number_limits,
        prize_rules,
        prize_schemes,
        draws,
        games,
        users,
        organizations
      RESTART IDENTITY CASCADE;
    `);

    await client.query('COMMIT');
    console.log('All existing data successfully cleared.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error truncating tables:', err);
    throw err;
  } finally {
    client.release();
  }

  // Ensure migrations are run and seed data is fresh
  await runMigrations();
  await runSeed();
  console.log('Database reset and seeded successfully.');
}

if (process.argv[1]?.endsWith('reset.ts') || process.argv[1]?.endsWith('reset.js')) {
  resetDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
