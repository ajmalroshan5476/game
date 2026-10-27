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
}
