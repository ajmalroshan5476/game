import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const isRemoteDb = Boolean(
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('localhost') &&
  !process.env.DATABASE_URL.includes('127.0.0.1')
);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/number_game_db',
  ssl: isRemoteDb ? { rejectUnauthorized: false } : undefined,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.LOG_SQL === 'true') {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }
  return res;
}

export async function getClient() {
  return await pool.connect();
}
