import { pool } from './pool.js';
import { getISTDateString } from '../utils/time.js';
import bcrypt from 'bcryptjs';

export async function runSeed() {
  const client = await pool.connect();
  try {
    console.log('Seeding initial data...');
    await client.query('BEGIN');

    // 1. Organization
    let orgRes = await client.query(`SELECT id FROM organizations LIMIT 1`);
    let orgId: string;
    if (orgRes.rows.length === 0) {
      const res = await client.query(
        `INSERT INTO organizations (name) VALUES ('Apex Gaming Network') RETURNING id`
      );
      orgId = res.rows[0].id;
    } else {
      orgId = orgRes.rows[0].id;
    }

    // 2. Users: Skipped as requested ("don't seed any users, i will seed it")
    // Users table will remain completely unseeded.

    // 3. Games
    const games = [
      { name: 'LSK 3 PM', code: 'LSK_3PM', color: '#00A859' },
      { name: 'DEAR 1 PM', code: 'DEAR_1PM', color: '#2563EB' },
      { name: 'DEAR 6 PM', code: 'DEAR_6PM', color: '#D97706' },
      { name: 'DEAR 8 PM', code: 'DEAR_8PM', color: '#7C3AED' },
    ];

    const gameIds: Record<string, string> = {};
    for (const g of games) {
      let gRes = await client.query(
        `SELECT id FROM games WHERE org_id = $1 AND code = $2`,
        [orgId, g.code]
      );
      if (gRes.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO games (org_id, name, code, color) VALUES ($1, $2, $3, $4) RETURNING id`,
          [orgId, g.name, g.code, g.color]
        );
        gameIds[g.code] = ins.rows[0].id;
      } else {
        gameIds[g.code] = gRes.rows[0].id;
      }
    }

    // 4. Exact Prize Scheme matching Reference Screenshots
    let schemeRes = await client.query(
      `SELECT id FROM prize_schemes WHERE org_id = $1 AND name = 'Standard Scheme'`,
      [orgId]
    );
    let schemeId: string;
    if (schemeRes.rows.length === 0) {
      const ins = await client.query(
        `INSERT INTO prize_schemes (org_id, name, unit_rate) VALUES ($1, 'Standard Scheme', 10.00) RETURNING id`,
        [orgId]
      );
      schemeId = ins.rows[0].id;
    } else {
      schemeId = schemeRes.rows[0].id;
    }

    // Clear any existing prize rules and insert exact rules from reference screenshots
    await client.query(`DELETE FROM prize_rules WHERE scheme_id = $1`, [schemeId]);

    const rules = [
      // Group 3: SUPER (Rate: 10)
      { mode: 'SUPER', pos: 'FIRST', count: 1, prize: 5000.0, super: 400.0 },
      { mode: 'SUPER', pos: 'SECOND', count: 1, prize: 500.0, super: 50.0 },
      { mode: 'SUPER', pos: 'THIRD', count: 1, prize: 250.0, super: 20.0 },
      { mode: 'SUPER', pos: 'FOURTH', count: 1, prize: 100.0, super: 20.0 },
      { mode: 'SUPER', pos: 'FIFTH', count: 1, prize: 50.0, super: 20.0 },
      { mode: 'SUPER', pos: 'SIXTH', count: 30, prize: 20.0, super: 10.0 },

      // Group 3: BOX (Rate: 10)
      { mode: 'BOX', pos: 'FIRST', count: 1, prize: 3000.0, super: 300.0 },
      { mode: 'BOX', pos: 'SECOND', count: 1, prize: 800.0, super: 30.0 },
      { mode: 'BOX', pos: 'THIRD', count: 1, prize: 800.0, super: 30.0 },
      { mode: 'BOX', pos: 'FOURTH', count: 1, prize: 800.0, super: 30.0 },
      { mode: 'BOX', pos: 'FIFTH', count: 1, prize: 800.0, super: 30.0 },
      { mode: 'BOX', pos: 'SIXTH', count: 1, prize: 800.0, super: 30.0 },

      // Group 2: AB, BC, AC (Rate: 10)
      { mode: 'AB', pos: 'FIRST', count: 1, prize: 700.0, super: 30.0 },
      { mode: 'BC', pos: 'FIRST', count: 1, prize: 700.0, super: 30.0 },
      { mode: 'AC', pos: 'FIRST', count: 1, prize: 700.0, super: 30.0 },

      // Group 1: A, B, C (Rate: 12)
      { mode: 'A', pos: 'FIRST', count: 1, prize: 100.0, super: 0.0 },
      { mode: 'B', pos: 'FIRST', count: 1, prize: 100.0, super: 0.0 },
      { mode: 'C', pos: 'FIRST', count: 1, prize: 100.0, super: 0.0 },
    ];

    for (const r of rules) {
      await client.query(
        `INSERT INTO prize_rules (scheme_id, mode, position, match_count, prize_amount, super_commission)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [schemeId, r.mode, r.pos, r.count, r.prize, r.super]
      );
    }

    // 5. Draws for today
    const todayStr = getISTDateString();
    const draws = [
      {
        gameCode: 'DEAR_1PM',
        drawTime: '13:00:00',
        cutoffTime: `${todayStr}T12:58:00+05:30`,
        editCutoffTime: `${todayStr}T12:55:00+05:30`,
      },
      {
        gameCode: 'LSK_3PM',
        drawTime: '15:00:00',
        cutoffTime: `${todayStr}T15:03:00+05:30`,
        editCutoffTime: `${todayStr}T15:00:00+05:30`,
      },
      {
        gameCode: 'DEAR_6PM',
        drawTime: '18:00:00',
        cutoffTime: `${todayStr}T17:58:00+05:30`,
        editCutoffTime: `${todayStr}T17:55:00+05:30`,
      },
      {
        gameCode: 'DEAR_8PM',
        drawTime: '20:00:00',
        cutoffTime: `${todayStr}T19:58:00+05:30`,
        editCutoffTime: `${todayStr}T19:55:00+05:30`,
      },
    ];

    let lskDrawId: string | null = null;
    for (const d of draws) {
      const gId = gameIds[d.gameCode];
      if (!gId) continue;
      let dRes = await client.query(
        `SELECT id FROM draws WHERE game_id = $1 AND draw_date = $2 AND draw_time = $3`,
        [gId, todayStr, d.drawTime]
      );
      let drawId: string;
      if (dRes.rows.length === 0) {
        const ins = await client.query(
          `INSERT INTO draws (game_id, draw_date, draw_time, cutoff_time, edit_cutoff_time, status)
           VALUES ($1, $2, $3, $4, $5, 'OPEN') RETURNING id`,
          [gId, todayStr, d.drawTime, d.cutoffTime, d.editCutoffTime]
        );
        drawId = ins.rows[0].id;
      } else {
        drawId = dRes.rows[0].id;
        // Ensure cutoff time is updated to authoritative schedule
        await client.query(
          `UPDATE draws SET cutoff_time = $1, edit_cutoff_time = $2 WHERE id = $3`,
          [d.cutoffTime, d.editCutoffTime, drawId]
        );
      }

      if (d.gameCode === 'LSK_3PM') {
        lskDrawId = drawId;
      }
    }

    // 6. Configured Number Limit: Number '717' max 100 for LSK 3PM
    if (lskDrawId) {
      await client.query(
        `INSERT INTO number_limits (org_id, draw_id, number, max_quantity)
         VALUES ($1, $2, '717', 100)
         ON CONFLICT (org_id, draw_id, number) DO UPDATE SET max_quantity = 100`,
        [orgId, lskDrawId]
      );

      await client.query(
        `INSERT INTO number_limit_counters (org_id, draw_id, number, accepted_quantity)
         VALUES ($1, $2, '717', 0)
         ON CONFLICT (org_id, draw_id, number) DO NOTHING`,
        [orgId, lskDrawId]
      );
    }

    await client.query('COMMIT');
    console.log('Seeding completed successfully (0 users seeded).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  runSeed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
