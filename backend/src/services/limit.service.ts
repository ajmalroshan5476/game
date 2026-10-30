import { query, pool } from '../db/pool.js';

export interface NumberLimitInfo {
  number: string;
  max_quantity: number;
  accepted_quantity: number;
  remaining_quantity: number;
}

export class LimitService {
  static async setLimit(
    orgId: string,
    drawId: string,
    rawNumber: string,
    maxQuantity: number
  ): Promise<void> {
    const number = rawNumber.trim();
    if (!number) throw new Error('Number is required');
    if (maxQuantity < 0) throw new Error('Max quantity must be non-negative');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO number_limits (org_id, draw_id, number, max_quantity, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (org_id, draw_id, number)
         DO UPDATE SET max_quantity = EXCLUDED.max_quantity, updated_at = NOW()`,
        [orgId, drawId, number, maxQuantity]
      );

      // Ensure counter row exists
      await client.query(
        `INSERT INTO number_limit_counters (org_id, draw_id, number, accepted_quantity)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (org_id, draw_id, number) DO NOTHING`,
        [orgId, drawId, number]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async getLimitsForDraw(orgId: string, drawId: string): Promise<NumberLimitInfo[]> {
    const res = await query(
      `SELECT nl.number, nl.max_quantity,
              COALESCE(nlc.accepted_quantity, 0) AS accepted_quantity,
              GREATEST(0, nl.max_quantity - COALESCE(nlc.accepted_quantity, 0)) AS remaining_quantity
       FROM number_limits nl
       LEFT JOIN number_limit_counters nlc
         ON nlc.org_id = nl.org_id AND nlc.draw_id = nl.draw_id AND nlc.number = nl.number
       WHERE nl.org_id = $1 AND nl.draw_id = $2
       ORDER BY nl.number ASC`,
      [orgId, drawId]
    );

    return res.rows.map((r) => ({
      number: r.number,
      max_quantity: parseInt(r.max_quantity, 10),
      accepted_quantity: parseInt(r.accepted_quantity, 10),
      remaining_quantity: parseInt(r.remaining_quantity, 10),
    }));
  }

  /**
   * Authoritative reconciliation of number_limit_counters from active tickets.
   */
  static async reconcileCounters(orgId: string, drawId: string): Promise<{ reconciledNumbers: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Reset counters to 0 for this draw
      await client.query(
        `UPDATE number_limit_counters
         SET accepted_quantity = 0
         WHERE org_id = $1 AND draw_id = $2`,
        [orgId, drawId]
      );

      // 2. Sum active ticket entries by number
      const activeSums = await client.query(
        `SELECT te.number, SUM(te.quantity) AS total_qty
         FROM ticket_entries te
         JOIN tickets t ON t.id = te.ticket_id
         WHERE t.org_id = $1 AND t.draw_id = $2 AND t.status = 'ACTIVE'
         GROUP BY te.number`,
        [orgId, drawId]
      );

      // 3. Upsert true active quantities
      for (const row of activeSums.rows) {
        await client.query(
          `INSERT INTO number_limit_counters (org_id, draw_id, number, accepted_quantity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (org_id, draw_id, number)
           DO UPDATE SET accepted_quantity = EXCLUDED.accepted_quantity`,
          [orgId, drawId, row.number, parseInt(row.total_qty, 10)]
        );
      }

      await client.query('COMMIT');
      return { reconciledNumbers: activeSums.rows.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // --------------------------------------------------------------------------
  // Universal Game Range Limits (e.g. 000-999 cap 100, 00-99, 0-9, or block cap 0)
  // --------------------------------------------------------------------------
  static async setGameRangeLimit(
    orgId: string,
    gameId: string,
    digitType: number,
    startRange: string,
    endRange: string,
    maxCap: number
  ) {
    if (!gameId) throw new Error('Game is required');
    if (![1, 2, 3].includes(digitType)) throw new Error('Digit type must be 1, 2, or 3');
    const start = parseInt(startRange, 10);
    const end = parseInt(endRange, 10);
    if (isNaN(start) || isNaN(end) || start > end) {
      throw new Error(`Invalid range: ${startRange} to ${endRange}`);
    }
    if (maxCap < 0) {
      throw new Error('Max cap must be non-negative (0 means blocked)');
    }

    const cleanStart = String(start).padStart(digitType, '0');
    const cleanEnd = String(end).padStart(digitType, '0');

    if (gameId === 'ALL') {
      const gRes = await query(`SELECT id FROM games WHERE org_id = $1`, [orgId]);
      let lastRow: any = null;
      for (const g of gRes.rows) {
        const res = await query(
          `INSERT INTO game_range_limits (org_id, game_id, digit_type, start_range, end_range, max_cap, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           RETURNING id, game_id, digit_type, start_range, end_range, max_cap, created_at`,
          [orgId, g.id, digitType, cleanStart, cleanEnd, maxCap]
        );
        lastRow = res.rows[0];
      }
      return lastRow || { success: true };
    }

    const res = await query(
      `INSERT INTO game_range_limits (org_id, game_id, digit_type, start_range, end_range, max_cap, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, game_id, digit_type, start_range, end_range, max_cap, created_at`,
      [orgId, gameId, digitType, cleanStart, cleanEnd, maxCap]
    );

    return res.rows[0];
  }

  static async getGameRangeLimits(orgId: string, gameId?: string) {
    let sql = `
      SELECT grl.id, grl.game_id, grl.digit_type, grl.start_range, grl.end_range, grl.max_cap, grl.created_at,
             g.name AS game_name, g.code AS game_code
      FROM game_range_limits grl
      JOIN games g ON g.id = grl.game_id
      WHERE grl.org_id = $1
    `;
    const params: any[] = [orgId];

    if (gameId && gameId !== 'ALL') {
      params.push(gameId);
      sql += ` AND grl.game_id = $2`;
    }

    sql += ` ORDER BY g.name ASC, grl.digit_type ASC, grl.start_range ASC`;
    const res = await query(sql, params);
    return res.rows.map((r) => ({
      id: r.id,
      gameId: r.game_id,
      gameName: r.game_name,
      gameCode: r.game_code,
      digitType: parseInt(r.digit_type, 10),
      startRange: r.start_range,
      endRange: r.end_range,
      maxCap: parseInt(r.max_cap, 10),
      createdAt: r.created_at,
    }));
  }

  static async deleteGameRangeLimit(orgId: string, id: string) {
    await query(`DELETE FROM game_range_limits WHERE id = $1 AND org_id = $2`, [id, orgId]);
    return { success: true };
  }
}

