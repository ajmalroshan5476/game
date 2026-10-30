import { query, pool } from '../db/pool.js';

export interface UserTicketPriceInput {
  gameId?: string | null;
  mode: string; // 'SUPER' | 'BOX' | 'AB' | 'BC' | 'AC' | 'A' | 'B' | 'C'
  price: number;
  commission?: number;
}

export const DEFAULT_PRICES: Record<string, number> = {
  SUPER: 10.0,
  BOX: 10.0,
  AB: 10.0,
  BC: 10.0,
  AC: 10.0,
  A: 12.0,
  B: 12.0,
  C: 12.0,
};

export class PricingService {
  /**
   * Get all custom prices for a specific user
   */
  static async getUserPrices(orgId: string, userId: string) {
    const res = await query(
      `SELECT utp.id, utp.user_id, utp.game_id, utp.mode, utp.price, utp.commission,
              g.name AS game_name, g.code AS game_code
       FROM user_ticket_prices utp
       LEFT JOIN games g ON g.id = utp.game_id
       WHERE utp.org_id = $1 AND utp.user_id = $2
       ORDER BY g.name ASC NULLS FIRST, utp.mode ASC`,
      [orgId, userId]
    );

    return res.rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      gameId: r.game_id,
      gameName: r.game_name || 'All Games (Default)',
      gameCode: r.game_code || 'ALL',
      mode: r.mode,
      price: parseFloat(r.price),
      commission: parseFloat(r.commission || '0'),
    }));
  }

  /**
   * Upsert custom prices for a user
   */
  static async setUserPrices(orgId: string, userId: string, prices: UserTicketPriceInput[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const item of prices) {
        const mode = item.mode.trim().toUpperCase();
        const price = Number(item.price);
        const commission = Number(item.commission || 0);
        const gameId = item.gameId && item.gameId !== 'ALL' && item.gameId !== '' ? item.gameId : null;

        if (isNaN(price) || price < 0) {
          throw new Error(`Invalid price for mode ${mode}: must be non-negative number`);
        }

        if (gameId) {
          await client.query(
            `INSERT INTO user_ticket_prices (org_id, user_id, game_id, mode, price, commission, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (user_id, COALESCE(game_id, '00000000-0000-0000-0000-000000000000'::uuid), mode)
             DO UPDATE SET price = EXCLUDED.price, commission = EXCLUDED.commission, updated_at = NOW()`,
            [orgId, userId, gameId, mode, price, commission]
          );
        } else {
          await client.query(
            `INSERT INTO user_ticket_prices (org_id, user_id, game_id, mode, price, commission, updated_at)
             VALUES ($1, $2, NULL, $3, $4, $5, NOW())
             ON CONFLICT (user_id, COALESCE(game_id, '00000000-0000-0000-0000-000000000000'::uuid), mode)
             DO UPDATE SET price = EXCLUDED.price, commission = EXCLUDED.commission, updated_at = NOW()`,
            [orgId, userId, mode, price, commission]
          );
        }
      }

      await client.query('COMMIT');
      return { success: true, count: prices.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get effective pricing map for a user and game
   */
  static async getEffectivePriceMap(orgId: string, userId: string, gameId?: string): Promise<Map<string, number>> {
    const priceMap = new Map<string, number>();

    // Start with system defaults
    for (const [mode, defaultRate] of Object.entries(DEFAULT_PRICES)) {
      priceMap.set(mode, defaultRate);
    }

    // Query user prices (both game-specific and global fallback for this user)
    const res = await query(
      `SELECT game_id, mode, price
       FROM user_ticket_prices
       WHERE org_id = $1 AND user_id = $2
         AND (game_id IS NULL OR game_id = $3)`,
      [orgId, userId, gameId || null]
    );

    // Apply global user defaults first
    for (const row of res.rows) {
      if (!row.game_id) {
        priceMap.set(row.mode.toUpperCase(), parseFloat(row.price));
      }
    }

    // Apply game-specific overrides
    for (const row of res.rows) {
      if (row.game_id && row.game_id === gameId) {
        priceMap.set(row.mode.toUpperCase(), parseFloat(row.price));
      }
    }

    return priceMap;
  }
}
