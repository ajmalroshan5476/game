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

export interface BoxWinEvaluation {
  winningPos: string;
  prizeAmount: number;
  superCommission: number;
}

export function isBoxMatch(betNumber: string, winNumber: string): boolean {
  if (betNumber.length !== winNumber.length) return false;
  const sortedBet = betNumber.split('').sort().join('');
  const sortedWin = winNumber.split('').sort().join('');
  return sortedBet === sortedWin;
}

/**
 * Calculates prize and commission for BOX bets according to the digit distribution:
 * 1. Special Numbers (Triple Numbers): 000, 111, 222, 333, 444, 555, 666, 777, 888, 999
 *    - Prize amount: ₹7,000 | Commission: ₹300 (qty 1)
 * 2. Box Numbers Containing Two Identical Digits (e.g. 112, 313, 448):
 *    - Case A (Exact Match, e.g. 121 vs 121): Prize: ₹3,300 + ₹830 = ₹4,130 | Commission: ₹30 + ₹300 = ₹330 (qty 1)
 *    - Case B (Matching Box Pattern, e.g. 121 vs 112): Prize: ₹830 + ₹830 = ₹1,660 | Commission: ₹30 + ₹30 = ₹60 (qty 1)
 * 3. Normal Mixed Numbers (All Three Digits Different, e.g. 123, 456, 789):
 *    - Exact Match (123 vs 123): Prize: ₹3,000 | Commission: ₹300 (qty 1)
 * 4. Reverse / Permutation Box Winning (e.g. 123 vs 321 or 213):
 *    - Prize: ₹800 | Commission: ₹30 (qty 1)
 */
export function evaluateBoxWin(
  betNumber: string,
  firstPrize: string,
  getRule?: (mode: string, pos: string, fallbackPrize: number, fallbackSuper: number) => { prizeAmount: number; superCommission: number }
): BoxWinEvaluation | null {
  if (betNumber.length !== 3 || firstPrize.length < 3) return null;
  const clean1st = firstPrize.trim().substring(0, 3);
  if (!isBoxMatch(betNumber, clean1st)) return null;

  const lookup = getRule || ((_m, _p, p, s) => ({ prizeAmount: p, superCommission: s }));
  const uniqueDigits = new Set(clean1st.split('')).size;
  const isDirect = betNumber === clean1st;

  if (uniqueDigits === 1) {
    // 1. Triples: 000, 111, 222, 333, 444, 555, 666, 777, 888, 999
    const r = lookup('BOX', 'TRIPLE', 7000.0, 300.0);
    return {
      winningPos: 'BOX_TRIPLE',
      prizeAmount: r.prizeAmount,
      superCommission: r.superCommission,
    };
  }

  if (uniqueDigits === 2) {
    // 2. Doubles: e.g. 112, 313, 448 (exactly two identical digits)
    if (isDirect) {
      // Case A – Exact Match: ₹3,300 + ₹830 = ₹4,130 | Commission: ₹30 + ₹300 = ₹330
      const r = lookup('BOX', 'DOUBLE_1ST', 4130.0, 330.0);
      return {
        winningPos: 'BOX_DOUBLE_1ST',
        prizeAmount: r.prizeAmount,
        superCommission: r.superCommission,
      };
    } else {
      // Case B – Matching Box Pattern: ₹830 + ₹830 = ₹1,660 | Commission: ₹30 + ₹30 = ₹60
      const r = lookup('BOX', 'DOUBLE_OTH', 1660.0, 60.0);
      return {
        winningPos: 'BOX_DOUBLE_OTH',
        prizeAmount: r.prizeAmount,
        superCommission: r.superCommission,
      };
    }
  }

  // 3 & 4. Normal Mixed Numbers (all three digits different, e.g. 123)
  if (isDirect) {
    // Exact Match: ₹3,000 | Commission: ₹300
    const r = lookup('BOX', 'FIRST', 3000.0, 300.0);
    return {
      winningPos: 'BOX_FIRST',
      prizeAmount: r.prizeAmount,
      superCommission: r.superCommission,
    };
  } else {
    // Reverse / Permutation: ₹800 | Commission: ₹30
    const r = lookup('BOX', 'SECOND', 800.0, 30.0);
    return {
      winningPos: 'BOX_OTHER',
      prizeAmount: r.prizeAmount,
      superCommission: r.superCommission,
    };
  }
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
      const clean6thSet = new Set(clean6th);

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
        const matchedWins: Array<{ winningPos: string; rule: { prizeAmount: number; superCommission: number } }> = [];

        // 1. Evaluate 3-digit matches
        if (entry.number.length === 3) {
          if (entry.mode === 'BOX' || entry.is_box) {
            // BOX Mode Evaluation: ONLY first prize is eligible for the BOX prize!
            const boxWin = evaluateBoxWin(entry.number, clean1st, getRule);
            if (boxWin) {
              matchedWins.push({
                winningPos: boxWin.winningPos,
                rule: {
                  prizeAmount: boxWin.prizeAmount,
                  superCommission: boxWin.superCommission,
                },
              });
            }
          } else {
            // SUPER Mode Evaluation:
            // Check each prize independently so repeated numbers anywhere win for each occurrence
            if (entry.number === clean1st) {
              matchedWins.push({ winningPos: 'FIRST', rule: getRule('SUPER', 'FIRST', 5000.0, 400.0) });
            }
            if (clean2nd && entry.number === clean2nd) {
              matchedWins.push({ winningPos: 'SECOND', rule: getRule('SUPER', 'SECOND', 500.0, 50.0) });
            }
            if (clean3rd && entry.number === clean3rd) {
              matchedWins.push({ winningPos: 'THIRD', rule: getRule('SUPER', 'THIRD', 250.0, 20.0) });
            }
            if (clean4th && entry.number === clean4th) {
              matchedWins.push({ winningPos: 'FOURTH', rule: getRule('SUPER', 'FOURTH', 100.0, 20.0) });
            }
            if (clean5th && entry.number === clean5th) {
              matchedWins.push({ winningPos: 'FIFTH', rule: getRule('SUPER', 'FIFTH', 50.0, 20.0) });
            }
            // 6th prizes can contain duplicate/repeated numbers in results input, but an individual entry matches at most once (no doubling!)
            if (clean6thSet.has(entry.number)) {
              matchedWins.push({ winningPos: 'SIXTH', rule: getRule('SUPER', 'SIXTH', 20.0, 10.0) });
            }
          }
        }
        // 2. Evaluate 2-digit matches (AB, BC, AC)
        else if (entry.number.length === 2 && clean1st.length >= 3) {
          if (entry.mode === 'AB' && entry.number === clean1st.substring(0, 2)) {
            matchedWins.push({ winningPos: 'FIRST_AB', rule: getRule('AB', 'FIRST', 700.0, 30.0) });
          } else if (entry.mode === 'BC' && entry.number === clean1st.substring(1, 3)) {
            matchedWins.push({ winningPos: 'FIRST_BC', rule: getRule('BC', 'FIRST', 700.0, 30.0) });
          } else if (entry.mode === 'AC' && entry.number === clean1st[0] + clean1st[2]) {
            matchedWins.push({ winningPos: 'FIRST_AC', rule: getRule('AC', 'FIRST', 700.0, 30.0) });
          }
        }
        // 3. Evaluate 1-digit matches (A, B, C)
        else if (entry.number.length === 1 && clean1st.length >= 3) {
          if (entry.mode === 'A' && entry.number === clean1st[0]) {
            matchedWins.push({ winningPos: 'FIRST_A', rule: getRule('A', 'FIRST', 100.0, 0.0) });
          } else if (entry.mode === 'B' && entry.number === clean1st[1]) {
            matchedWins.push({ winningPos: 'FIRST_B', rule: getRule('B', 'FIRST', 100.0, 0.0) });
          } else if (entry.mode === 'C' && entry.number === clean1st[2]) {
            matchedWins.push({ winningPos: 'FIRST_C', rule: getRule('C', 'FIRST', 100.0, 0.0) });
          }
        }

        for (const match of matchedWins) {
          const qty = parseInt(entry.quantity, 10);
          const prizeTotal = match.rule.prizeAmount * qty;
          const commissionTotal = match.rule.superCommission * qty;

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
            prizePosition: match.winningPos,
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
              match.winningPos,
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
              `Prize: ${match.winningPos} for number ${entry.number}`,
              commissionTotal,
              `Super Commission: ${match.winningPos} for number ${entry.number}`,
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
   * If userId is provided, filters winners to only those belonging to that specific user.
   */
  static async getCheckResult(orgId: string, drawId: string, userId?: string) {
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

    // Find winning records for the active result of this draw under this org (and user if non-admin)
    let winnersRes: { rows: any[] } = { rows: [] };
    if (draw.result_id) {
      let whereClause = `WHERE wr.result_id = $1 AND wr.org_id = $2`;
      const params: any[] = [draw.result_id, orgId];
      if (userId) {
        params.push(userId);
        whereClause += ` AND wr.user_id = $${params.length}`;
      }

      winnersRes = await query(
        `SELECT DISTINCT ON (wr.id) wr.id, wr.prize_position, wr.prize_amount, wr.commission_amount, wr.created_at,
                t.ticket_number, t.customer_name,
                te.number AS winning_number, te.quantity, te.mode,
                u.username, u.id AS user_id
         FROM winning_records wr
         JOIN tickets t ON t.id = wr.ticket_id
         JOIN ticket_entries te ON te.id = wr.entry_id
         JOIN users u ON u.id = wr.user_id
         ${whereClause}
         ORDER BY wr.id, wr.prize_amount DESC, wr.created_at ASC`,
        params
      );
    }

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
