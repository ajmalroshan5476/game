import { pool, query } from '../db/pool.js';

export interface PublishResultPayload {
  drawId: string;
  firstPrize: string;
  secondPrize?: string;
  thirdPrize?: string;
  fourthPrize?: string;
  fifthPrize?: string;
  sixthPrizes?: string[]; // Array of up to 30 numbers
}

function isBoxMatch(betNumber: string, winNumber: string): boolean {
  if (betNumber.length !== winNumber.length) return false;
  const sortedBet = betNumber.split('').sort().join('');
  const sortedWin = winNumber.split('').sort().join('');
  return sortedBet === sortedWin;
}

export class ResultService {
  /**
   * Publish official results and process winning tickets & commission atomically
   */
  static async publishResult(orgId: string, adminId: string, payload: PublishResultPayload) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch draw
      const drawRes = await client.query(
        `SELECT d.id, d.game_id, d.draw_date, d.draw_time, d.status,
                g.name AS game_name, g.color AS game_color
         FROM draws d
         JOIN games g ON g.id = d.game_id
         WHERE d.id = $1 AND g.org_id = $2
         FOR UPDATE`,
        [payload.drawId, orgId]
      );

      if (drawRes.rows.length === 0) {
        throw new Error('Draw not found');
      }

      const draw = drawRes.rows[0];

      // 2. Fetch scheme rules
      const rulesRes = await client.query(
        `SELECT pr.position, pr.mode, pr.match_count, pr.prize_amount, pr.super_commission
         FROM prize_rules pr
         JOIN prize_schemes ps ON ps.id = pr.scheme_id
         WHERE ps.org_id = $1 AND ps.is_active = TRUE`,
        [orgId]
      );

      const rulesMap = new Map<string, { prizeAmount: number; superCommission: number }>();
      for (const r of rulesRes.rows) {
        rulesMap.set(`${r.mode}_${r.position}`, {
          prizeAmount: parseFloat(r.prize_amount),
          superCommission: parseFloat(r.super_commission),
        });
      }

      // Exact rules lookup with defaults matching the reference screenshots
      const getRule = (mode: string, pos: string, fallbackPrize: number, fallbackSuper: number) => {
        return rulesMap.get(`${mode}_${pos}`) || { prizeAmount: fallbackPrize, superCommission: fallbackSuper };
      };

      // 3. Clean up any previous results, winning records, and resulting ledger entries for this draw to avoid duplicates
      await client.query(
        `DELETE FROM financial_ledger WHERE draw_id = $1 AND entry_type IN ('PRIZE_PAYABLE', 'COMMISSION_PAYABLE')`,
        [payload.drawId]
      );
      await client.query(
        `DELETE FROM winning_records WHERE result_id IN (SELECT id FROM official_results WHERE draw_id = $1)`,
        [payload.drawId]
      );
      await client.query(`DELETE FROM official_results WHERE draw_id = $1`, [payload.drawId]);

      // Insert fresh official result
      const clean1st = payload.firstPrize.trim();
      const clean2nd = payload.secondPrize?.trim() || null;
      const clean3rd = payload.thirdPrize?.trim() || null;
      const clean4th = payload.fourthPrize?.trim() || null;
      const clean5th = payload.fifthPrize?.trim() || null;
      const clean6th = (payload.sixthPrizes || []).map((s) => s.trim()).filter(Boolean);

      const resultRes = await client.query(
        `INSERT INTO official_results (
           draw_id, first_prize, second_prize, third_prize, fourth_prize, fifth_prize, sixth_prizes, entered_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, version, created_at`,
        [
          payload.drawId,
          clean1st,
          clean2nd,
          clean3rd,
          clean4th,
          clean5th,
          JSON.stringify(clean6th),
          adminId,
        ]
      );

      const officialResult = resultRes.rows[0];

      // Update draw status
      await client.query(`UPDATE draws SET status = 'RESULTED' WHERE id = $1`, [payload.drawId]);

      // 4. Find all active ticket entries for this draw
      const entriesRes = await client.query(
        `SELECT te.id AS entry_id, te.number, te.quantity, te.mode, te.is_box,
                t.id AS ticket_id, t.user_id, t.ticket_number,
                u.username
         FROM ticket_entries te
         JOIN tickets t ON t.id = te.ticket_id
         JOIN users u ON u.id = t.user_id
         WHERE t.draw_id = $1 AND t.org_id = $2 AND t.status = 'ACTIVE'`,
        [payload.drawId, orgId]
      );

      let totalWinners = 0;
      let totalPrizePayout = 0;
      let totalCommissionPayout = 0;
      const winners: Array<{
        userId: string;
        username: string;
        ticketId: string;
        ticketNumber: string;
        number: string;
        quantity: number;
        mode: string;
        prizePosition: string;
        prizeAmount: number;
        commissionAmount: number;
      }> = [];

      for (const entry of entriesRes.rows) {
        let winningPos: string | null = null;
        let rule: { prizeAmount: number; superCommission: number } | null = null;

        // 1. Evaluate 3-digit matches
        if (entry.number.length === 3) {
          if (entry.mode === 'BOX' || entry.is_box) {
            // BOX Mode Evaluation: ONLY first prize is eligible for the BOX prize!
            // No other number (2nd, 3rd, 4th, 5th, 6th) is eligible for BOX.
            if (entry.number === clean1st) {
              // Exact 1st Prize match: Position 1
              winningPos = 'BOX_FIRST';
              rule = getRule('BOX', 'FIRST', 3000.0, 300.0);
            } else if (isBoxMatch(entry.number, clean1st)) {
              // Permutation of 1st Prize
              winningPos = 'BOX_OTHER';
              rule = getRule('BOX', 'SECOND', 800.0, 30.0);
            }
          } else {
            // SUPER Mode Evaluation
            if (entry.number === clean1st) {
              winningPos = 'FIRST';
              rule = getRule('SUPER', 'FIRST', 5000.0, 400.0);
            } else if (clean2nd && entry.number === clean2nd) {
              winningPos = 'SECOND';
              rule = getRule('SUPER', 'SECOND', 500.0, 50.0);
            } else if (clean3rd && entry.number === clean3rd) {
              winningPos = 'THIRD';
              rule = getRule('SUPER', 'THIRD', 250.0, 20.0);
            } else if (clean4th && entry.number === clean4th) {
              winningPos = 'FOURTH';
              rule = getRule('SUPER', 'FOURTH', 100.0, 20.0);
            } else if (clean5th && entry.number === clean5th) {
              winningPos = 'FIFTH';
              rule = getRule('SUPER', 'FIFTH', 50.0, 20.0);
            } else if (clean6th.includes(entry.number)) {
              winningPos = 'SIXTH';
              rule = getRule('SUPER', 'SIXTH', 20.0, 10.0);
            }
          }
        }
        // 2. Evaluate 2-digit matches (AB, BC, AC)
        else if (entry.number.length === 2 && clean1st.length >= 3) {
          if (entry.mode === 'AB' && entry.number === clean1st.substring(0, 2)) {
            winningPos = 'FIRST_AB';
            rule = getRule('AB', 'FIRST', 700.0, 30.0);
          } else if (entry.mode === 'BC' && entry.number === clean1st.substring(1, 3)) {
            winningPos = 'FIRST_BC';
            rule = getRule('BC', 'FIRST', 700.0, 30.0);
          } else if (entry.mode === 'AC' && entry.number === clean1st[0] + clean1st[2]) {
            winningPos = 'FIRST_AC';
            rule = getRule('AC', 'FIRST', 700.0, 30.0);
          }
        }
        // 3. Evaluate 1-digit matches (A, B, C)
        else if (entry.number.length === 1 && clean1st.length >= 3) {
          if (entry.mode === 'A' && entry.number === clean1st[0]) {
            winningPos = 'FIRST_A';
            rule = getRule('A', 'FIRST', 100.0, 0.0);
          } else if (entry.mode === 'B' && entry.number === clean1st[1]) {
            winningPos = 'FIRST_B';
            rule = getRule('B', 'FIRST', 100.0, 0.0);
          } else if (entry.mode === 'C' && entry.number === clean1st[2]) {
            winningPos = 'FIRST_C';
            rule = getRule('C', 'FIRST', 100.0, 0.0);
          }
        }

        if (winningPos && rule) {
          const qty = parseInt(entry.quantity, 10);
          const prizeTotal = rule.prizeAmount * qty;
          const commissionTotal = rule.superCommission * qty;

          totalWinners++;
          totalPrizePayout += prizeTotal;
          totalCommissionPayout += commissionTotal;

          winners.push({
            userId: entry.user_id,
            username: entry.username,
            ticketId: entry.ticket_id,
            ticketNumber: entry.ticket_number,
            number: entry.number,
            quantity: qty,
            mode: entry.mode,
            prizePosition: winningPos,
            prizeAmount: prizeTotal,
            commissionAmount: commissionTotal,
          });

          // Record winning entry
          await client.query(
            `INSERT INTO winning_records (
               result_id, ticket_id, entry_id, user_id, org_id, prize_position, prize_amount, commission_amount
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              officialResult.id,
              entry.ticket_id,
              entry.entry_id,
              entry.user_id,
              orgId,
              winningPos,
              prizeTotal,
              commissionTotal,
            ]
          );

          // Add financial ledger records
          await client.query(
            `INSERT INTO financial_ledger (
               org_id, user_id, draw_id, ticket_id, entry_type, amount, reference_id, notes
             )
             VALUES
             ($1, $2, $3, $4, 'PRIZE_PAYABLE', $5, $6, $7),
             ($1, $2, $3, $4, 'COMMISSION_PAYABLE', $8, $6, $9)`,
            [
              orgId,
              entry.user_id,
              payload.drawId,
              entry.ticket_id,
              prizeTotal,
              entry.ticket_number,
              `Prize: ${winningPos} for number ${entry.number}`,
              commissionTotal,
              `Super Commission: ${winningPos} for number ${entry.number}`,
            ]
          );
        }
      }

      await client.query('COMMIT');

      return {
        resultId: officialResult.id,
        drawId: payload.drawId,
        gameName: draw.game_name,
        drawDate: draw.draw_date,
        firstPrize: clean1st,
        totalWinners,
        totalPrizePayout,
        totalCommissionPayout,
        winners,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Result Checking: Inspect whether any numbers entered by users under this admin won,
   * along with the username, ticket number, mode, prize category, and amounts.
   */
  static async getCheckResult(orgId: string, drawId: string) {
    const drawRes = await query(
      `SELECT d.id, d.draw_date, d.draw_time, d.status,
              g.id AS game_id, g.name AS game_name, g.color AS game_color,
              r.id AS result_id, r.first_prize, r.second_prize, r.third_prize, r.fourth_prize, r.fifth_prize, r.sixth_prizes
       FROM draws d
       JOIN games g ON g.id = d.game_id
       LEFT JOIN LATERAL (
         SELECT * FROM official_results WHERE draw_id = d.id ORDER BY created_at DESC LIMIT 1
       ) r ON true
       WHERE d.id = $1 AND g.org_id = $2`,
      [drawId, orgId]
    );

    if (drawRes.rows.length === 0) {
      throw new Error('Draw not found');
    }

    const draw = drawRes.rows[0];

    // Find winning records for the active result of this draw under this org
    const winnersRes = draw.result_id
      ? await query(
          `SELECT DISTINCT ON (wr.id) wr.id, wr.prize_position, wr.prize_amount, wr.commission_amount, wr.created_at,
                  t.ticket_number, t.customer_name,
                  te.number AS winning_number, te.quantity, te.mode,
                  u.username, u.id AS user_id
           FROM winning_records wr
           JOIN tickets t ON t.id = wr.ticket_id
           JOIN ticket_entries te ON te.id = wr.entry_id
           JOIN users u ON u.id = wr.user_id
           WHERE wr.result_id = $1 AND wr.org_id = $2
           ORDER BY wr.id, wr.prize_amount DESC, wr.created_at ASC`,
          [draw.result_id, orgId]
        )
      : { rows: [] };

    let totalPrize = 0;
    let totalCommission = 0;
    for (const w of winnersRes.rows) {
      totalPrize += parseFloat(w.prize_amount);
      totalCommission += parseFloat(w.commission_amount);
    }

    return {
      draw: {
        id: draw.id,
        gameId: draw.game_id,
        gameName: draw.game_name,
        gameColor: draw.game_color,
        drawDate: draw.draw_date,
        drawTime: draw.draw_time,
        status: draw.status,
      },
      result: draw.result_id
        ? {
            id: draw.result_id,
            firstPrize: draw.first_prize,
            secondPrize: draw.second_prize,
            thirdPrize: draw.third_prize,
            fourthPrize: draw.fourth_prize,
            fifthPrize: draw.fifth_prize,
            sixthPrizes: draw.sixth_prizes,
          }
        : null,
      summary: {
        hasWinners: winnersRes.rows.length > 0,
        totalWinners: winnersRes.rows.length,
        totalPrize,
        totalCommission,
      },
      winners: winnersRes.rows,
    };
  }

  /**
   * View results by draw date and game
   */
  static async getResults(orgId: string, drawDate?: string, gameId?: string) {
    let sql = `
      SELECT r.id, r.version, r.first_prize, r.second_prize, r.third_prize,
             r.fourth_prize, r.fifth_prize, r.sixth_prizes, r.created_at,
             d.id AS draw_id, d.draw_date, d.draw_time,
             g.name AS game_name, g.color AS game_color, g.id AS game_id
      FROM official_results r
      JOIN draws d ON d.id = r.draw_id
      JOIN games g ON g.id = d.game_id
      WHERE g.org_id = $1
    `;
    const params: any[] = [orgId];

    if (drawDate && drawDate !== 'ALL' && drawDate !== 'undefined') {
      params.push(drawDate);
      sql += ` AND d.draw_date = $${params.length}`;
    }

    if (gameId && gameId !== 'ALL' && gameId !== 'undefined') {
      params.push(gameId);
      sql += ` AND (g.id::text = $${params.length} OR g.code ILIKE $${params.length} OR g.name ILIKE $${params.length})`;
    }

    sql += ` ORDER BY d.draw_date DESC, d.draw_time DESC`;

    const res = await query(sql, params);
    return res.rows;
  }
}
