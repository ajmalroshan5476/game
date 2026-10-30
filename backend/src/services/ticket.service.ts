import { pool } from '../db/pool.js';
import { PricingService } from './pricing.service.js';

export type TicketMode = 'A' | 'B' | 'C' | 'AB' | 'AC' | 'BC' | 'SUPER' | 'BOX';

export interface EntryInput {
  number?: string;
  startRange?: string;
  endRange?: string;
  quantity: number;
  mode?: TicketMode;
  isBox?: boolean;
}

export function normalizeModeForNumber(
  numStr: string,
  requestedMode?: string,
  isBoxExplicit?: boolean
): { mode: TicketMode; isBox: boolean } {
  const len = numStr.length;
  const upper = requestedMode?.toUpperCase();

  if (len === 1) {
    const mode = ['A', 'B', 'C'].includes(upper || '') ? (upper as TicketMode) : 'A';
    return { mode, isBox: false };
  } else if (len === 2) {
    const mode = ['AB', 'BC', 'AC'].includes(upper || '') ? (upper as TicketMode) : 'AB';
    return { mode, isBox: false };
  } else {
    // 3 or more digits: SUPER or BOX
    const isBox = Boolean(isBoxExplicit || upper === 'BOX');
    return { mode: isBox ? 'BOX' : 'SUPER', isBox };
  }
}

export interface SubmitTicketPayload {
  drawId: string;
  customerName?: string;
  entries: EntryInput[];
  idempotencyKey?: string;
}

export class LimitExceededError extends Error {
  number: string;
  maxQuantity: number;
  currentlyAccepted: number;
  requested: number;
  remaining: number;

  constructor(data: {
    number: string;
    maxQuantity: number;
    currentlyAccepted: number;
    requested: number;
    remaining: number;
  }) {
    super(
      `Ticket rejected: Number ${data.number} has reached capacity (Max cap: ${data.maxQuantity} units, currently accepted: ${data.currentlyAccepted}, remaining: ${data.remaining}). Total users limit reached.`
    );
    this.name = 'LimitExceededError';
    this.number = data.number;
    this.maxQuantity = data.maxQuantity;
    this.currentlyAccepted = data.currentlyAccepted;
    this.requested = data.requested;
    this.remaining = data.remaining;
  }
}

export class TicketService {
  /**
   * Expand single entries and ranges into normalized individual ticket entries with per-user pricing
   */
  static expandEntries(
    rawEntries: EntryInput[],
    unitRate: number,
    priceMap?: Map<string, number>
  ) {
    const expanded: Array<{
      number: string;
      quantity: number;
      mode: TicketMode;
      isBox: boolean;
      unitPrice: number;
      totalPrice: number;
    }> = [];

    const getPrice = (mode: string) => {
      if (priceMap && priceMap.has(mode)) {
        return priceMap.get(mode)!;
      }
      return (mode === 'A' || mode === 'B' || mode === 'C') ? 12.0 : unitRate;
    };

    for (const entry of rawEntries) {
      const qty = Math.floor(entry.quantity);
      if (isNaN(qty) || qty <= 0) {
        throw new Error('Quantity must be a positive integer');
      }

      // Range check
      if (entry.startRange && entry.endRange) {
        const start = parseInt(entry.startRange, 10);
        const end = parseInt(entry.endRange, 10);

        if (isNaN(start) || isNaN(end) || start > end) {
          throw new Error(`Invalid range: ${entry.startRange} to ${entry.endRange}`);
        }

        if (end - start > 500) {
          throw new Error('Range exceeds maximum allowed limit of 500 numbers per entry');
        }

        const padLen = entry.startRange.length;
        for (let n = start; n <= end; n++) {
          const numStr = String(n).padStart(padLen, '0');
          const { mode, isBox } = normalizeModeForNumber(numStr, entry.mode, entry.isBox);
          const effectiveRate = getPrice(mode);
          expanded.push({
            number: numStr,
            quantity: qty,
            mode,
            isBox,
            unitPrice: effectiveRate,
            totalPrice: qty * effectiveRate,
          });
        }
      } else if (entry.number) {
        const numStr = entry.number.trim();
        if (!numStr) throw new Error('Number is required for single entry');
        const { mode, isBox } = normalizeModeForNumber(numStr, entry.mode, entry.isBox);
        const effectiveRate = getPrice(mode);
        expanded.push({
          number: numStr,
          quantity: qty,
          mode,
          isBox,
          unitPrice: effectiveRate,
          totalPrice: qty * effectiveRate,
        });
      } else {
        throw new Error('Either number or valid startRange/endRange must be provided');
      }
    }

    if (expanded.length === 0) {
      throw new Error('Ticket must contain at least one valid number entry');
    }

    return expanded;
  }

  /**
   * Concurrency-safe, atomic ticket submission enforcing draw cutoffs and number limits
   */
  static async submitTicket(
    orgId: string,
    userId: string,
    payload: SubmitTicketPayload
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Idempotency check
      if (payload.idempotencyKey) {
        const existing = await client.query(
          `SELECT t.id, t.ticket_number, t.total_quantity, t.total_amount, t.status, t.created_at
           FROM tickets t
           WHERE t.idempotency_key = $1 AND t.org_id = $2`,
          [payload.idempotencyKey, orgId]
        );
        if (existing.rows.length > 0) {
          await client.query('COMMIT');
          return {
            ...existing.rows[0],
            isDuplicate: true,
          };
        }
      }

      // 2. Validate draw and authoritative cutoff time
      const drawRes = await client.query(
        `SELECT d.id, d.game_id, d.draw_date, d.draw_time, d.cutoff_time, d.status,
                g.name AS game_name, g.color AS game_color
         FROM draws d
         JOIN games g ON g.id = d.game_id
         WHERE d.id = $1 AND g.org_id = $2
         FOR SHARE`,
        [payload.drawId, orgId]
      );

      if (drawRes.rows.length === 0) {
        throw new Error('Selected draw not found');
      }

      const draw = drawRes.rows[0];
      if (draw.status !== 'OPEN') {
        throw new Error(`Draw is ${draw.status.toLowerCase()} and cannot accept tickets`);
      }

      const now = new Date();
      const cutoff = new Date(draw.cutoff_time);
      if (now.getTime() >= cutoff.getTime()) {
        throw new Error(
          `Submission closed: Cutoff time (${cutoff.toLocaleTimeString('en-IN')}) has passed for today. Bookings for tomorrow will open after 12:00 AM.`
        );
      }

      // 3. Get user-specific pricing for this game and category
      const schemeRes = await client.query(
        `SELECT unit_rate FROM prize_schemes WHERE org_id = $1 AND is_active = TRUE LIMIT 1`,
        [orgId]
      );
      const unitRate = schemeRes.rows.length > 0 ? parseFloat(schemeRes.rows[0].unit_rate) : 10.0;
      const userPriceMap = await PricingService.getEffectivePriceMap(orgId, userId, draw.game_id);

      // 4. Expand entries with user-specific prices
      const expandedEntries = this.expandEntries(payload.entries, unitRate, userPriceMap);

      // 5. Aggregate requested quantities per number
      const requestedByNumber = new Map<string, number>();
      let totalQty = 0;
      let totalAmount = 0;

      for (const item of expandedEntries) {
        totalQty += item.quantity;
        totalAmount += item.totalPrice;
        const curr = requestedByNumber.get(item.number) || 0;
        requestedByNumber.set(item.number, curr + item.quantity);
      }

      // Deterministic sorted list of numbers to prevent deadlocks across concurrent requests
      const sortedNumbers = Array.from(requestedByNumber.keys()).sort();

      // 6. Ensure counter records exist for all numbers
      for (const num of sortedNumbers) {
        await client.query(
          `INSERT INTO number_limit_counters (org_id, draw_id, number, accepted_quantity)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (org_id, draw_id, number) DO NOTHING`,
          [orgId, payload.drawId, num]
        );
      }

      // 7. Lock counter rows for update
      const counterRows = await client.query(
        `SELECT number, accepted_quantity
         FROM number_limit_counters
         WHERE org_id = $1 AND draw_id = $2 AND number = ANY($3)
         FOR UPDATE`,
        [orgId, payload.drawId, sortedNumbers]
      );

      const acceptedMap = new Map<string, number>();
      for (const row of counterRows.rows) {
        acceptedMap.set(row.number, parseInt(row.accepted_quantity, 10));
      }

      // 8. Query configured draw-specific limits
      const limitRows = await client.query(
        `SELECT number, max_quantity
         FROM number_limits
         WHERE org_id = $1 AND draw_id = $2 AND number = ANY($3)`,
        [orgId, payload.drawId, sortedNumbers]
      );

      const maxLimitMap = new Map<string, number>();
      for (const row of limitRows.rows) {
        maxLimitMap.set(row.number, parseInt(row.max_quantity, 10));
      }

      // 8b. Query Universal Game Range Limits for this game (single, double, triple digits)
      const rangeLimitsRes = await client.query(
        `SELECT digit_type, start_range, end_range, max_cap
         FROM game_range_limits
         WHERE org_id = $1 AND game_id = $2`,
        [orgId, draw.game_id]
      );

      for (const num of sortedNumbers) {
        const numVal = parseInt(num, 10);
        for (const rl of rangeLimitsRes.rows) {
          if (num.length === parseInt(rl.digit_type, 10)) {
            const startVal = parseInt(rl.start_range, 10);
            const endVal = parseInt(rl.end_range, 10);
            if (numVal >= startVal && numVal <= endVal) {
              const cap = parseInt(rl.max_cap, 10);
              if (cap === 0) {
                throw new Error(`Ticket rejected: Number ${num} is currently blocked for this game`);
              }
              const currentCap = maxLimitMap.get(num);
              maxLimitMap.set(num, currentCap !== undefined ? Math.min(currentCap, cap) : cap);
            }
          }
        }
      }

      // 9. Enforce limits
      for (const num of sortedNumbers) {
        const maxLimit = maxLimitMap.get(num);
        if (maxLimit !== undefined) {
          const currentlyAccepted = acceptedMap.get(num) || 0;
          const requested = requestedByNumber.get(num) || 0;
          const remaining = Math.max(0, maxLimit - currentlyAccepted);

          if (currentlyAccepted + requested > maxLimit) {
            // Rollback and reject
            throw new LimitExceededError({
              number: num,
              maxQuantity: maxLimit,
              currentlyAccepted,
              requested,
              remaining,
            });
          }
        }
      }

      // 10. Update counters
      for (const [num, reqQty] of requestedByNumber.entries()) {
        await client.query(
          `UPDATE number_limit_counters
           SET accepted_quantity = accepted_quantity + $1
           WHERE org_id = $2 AND draw_id = $3 AND number = $4`,
          [reqQty, orgId, payload.drawId, num]
        );
      }

      // 11. Generate clean Bill Number matching screenshot (e.g. 2118921)
      const baseBill = 2100000 + Math.floor(Math.random() * 890000);
      let ticketNumber = `${baseBill}`;
      // Verify uniqueness
      const checkExist = await client.query(`SELECT id FROM tickets WHERE ticket_number = $1`, [ticketNumber]);
      if (checkExist.rows.length > 0) {
        ticketNumber = `${baseBill}${Math.floor(10 + Math.random() * 89)}`;
      }

      // 12. Insert ticket header
      const ticketRes = await client.query(
        `INSERT INTO tickets (
           ticket_number, org_id, user_id, draw_id, customer_name,
           total_quantity, total_amount, status, idempotency_key
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8)
         RETURNING id, ticket_number, total_quantity, total_amount, status, created_at`,
        [
          ticketNumber,
          orgId,
          userId,
          payload.drawId,
          payload.customerName?.trim() || null,
          totalQty,
          totalAmount,
          payload.idempotencyKey || null,
        ]
      );

      const savedTicket = ticketRes.rows[0];

      // 13. Insert entries in batch
      for (const entry of expandedEntries) {
        await client.query(
          `INSERT INTO ticket_entries (
             ticket_id, number, quantity, mode, is_box, unit_price, total_price
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            savedTicket.id,
            entry.number,
            entry.quantity,
            entry.mode,
            entry.isBox,
            entry.unitPrice,
            entry.totalPrice,
          ]
        );
      }

      // 14. Record sales liability in financial ledger
      await client.query(
        `INSERT INTO financial_ledger (
           org_id, user_id, draw_id, ticket_id, entry_type, amount, reference_id, notes
         )
         VALUES ($1, $2, $3, $4, 'TICKET_SALE', $5, $6, 'Ticket purchase')`,
        [orgId, userId, payload.drawId, savedTicket.id, totalAmount, ticketNumber]
      );

      await client.query('COMMIT');

      return {
        ...savedTicket,
        drawName: draw.game_name,
        drawTime: draw.draw_time,
        gameColor: draw.game_color,
        customerName: payload.customerName || null,
        entryCount: expandedEntries.length,
        entries: expandedEntries.slice(0, 50), // Sample for response
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel / delete a ticket and atomically release capacity & record ledger reversal
   */
  static async cancelTicket(orgId: string, userId: string, ticketNumber: string, isAdmin = false) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch ticket and draw
      const ticketRes = await client.query(
        `SELECT t.id, t.ticket_number, t.org_id, t.user_id, t.draw_id, t.total_amount, t.status,
                d.edit_cutoff_time, d.cutoff_time
         FROM tickets t
         JOIN draws d ON d.id = t.draw_id
         WHERE t.ticket_number = $1 AND t.org_id = $2
         FOR UPDATE`,
        [ticketNumber.trim(), orgId]
      );

      if (ticketRes.rows.length === 0) {
        throw new Error('Ticket not found');
      }

      const ticket = ticketRes.rows[0];

      // Authorization check
      if (!isAdmin && ticket.user_id !== userId) {
        throw new Error('Unauthorized to cancel this ticket');
      }

      if (ticket.status === 'CANCELLED') {
        throw new Error('Ticket is already cancelled');
      }

      // Cutoff check
      const now = new Date();
      const editCutoff = new Date(ticket.edit_cutoff_time || ticket.cutoff_time);
      if (now.getTime() >= editCutoff.getTime() && !isAdmin) {
        throw new Error(
          `Cannot cancel ticket: Edit/Delete cutoff time (${editCutoff.toLocaleTimeString('en-IN')}) has passed`
        );
      }

      // 2. Fetch ticket entries
      const entriesRes = await client.query(
        `SELECT number, quantity FROM ticket_entries WHERE ticket_id = $1`,
        [ticket.id]
      );

      // 3. Mark ticket CANCELLED
      await client.query(
        `UPDATE tickets SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
        [ticket.id]
      );

      // 4. Release capacity counters
      for (const entry of entriesRes.rows) {
        await client.query(
          `UPDATE number_limit_counters
           SET accepted_quantity = GREATEST(0, accepted_quantity - $1)
           WHERE org_id = $2 AND draw_id = $3 AND number = $4`,
          [entry.quantity, orgId, ticket.draw_id, entry.number]
        );
      }

      // 5. Financial ledger reversal
      await client.query(
        `INSERT INTO financial_ledger (
           org_id, user_id, draw_id, ticket_id, entry_type, amount, reference_id, notes
         )
         VALUES ($1, $2, $3, $4, 'CANCELLATION_REVERSAL', $5, $6, 'Ticket cancelled')`,
        [orgId, ticket.user_id, ticket.draw_id, ticket.id, -parseFloat(ticket.total_amount), ticket.ticket_number]
      );

      await client.query('COMMIT');
      return { success: true, ticketNumber: ticket.ticket_number, status: 'CANCELLED' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Search ticket by ticket number
   */
  static async getTicketByNumber(orgId: string, userId: string, ticketNumber: string, isAdmin = false) {
    const res = await pool.query(
      `SELECT t.id, t.ticket_number, t.customer_name, t.total_quantity, t.total_amount,
              t.status, t.created_at, t.user_id,
              d.draw_date, d.draw_time, d.cutoff_time, d.edit_cutoff_time,
              g.name AS game_name, g.color AS game_color,
              u.username AS seller_username
       FROM tickets t
       JOIN draws d ON d.id = t.draw_id
       JOIN games g ON g.id = d.game_id
       JOIN users u ON u.id = t.user_id
       WHERE t.ticket_number = $1 AND t.org_id = $2`,
      [ticketNumber.trim(), orgId]
    );

    if (res.rows.length === 0) return null;
    const ticket = res.rows[0];

    if (!isAdmin && ticket.user_id !== userId) {
      throw new Error('Unauthorized to view this ticket');
    }

    const entriesRes = await pool.query(
      `SELECT id, number, quantity, mode, is_box, unit_price, total_price
       FROM ticket_entries
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
      [ticket.id]
    );

    return {
      ...ticket,
      entries: entriesRes.rows,
    };
  }
}
