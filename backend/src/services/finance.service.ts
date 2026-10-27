import { query, pool } from '../db/pool.js';

export interface SettlementSummary {
  userId: string;
  username: string;
  totalSales: number;
  totalPrizes: number;
  totalCommission: number;
  netBalance: number; // (Prizes + Commission) - Sales
  paidAmount: number;
  outstandingBalance: number;
}

export class FinanceService {
  /**
   * Calculate settlement breakdown for a user or all users in an organization
   */
  static async getSettlementSummary(
    orgId: string,
    targetUserId?: string,
    fromDate?: string,
    toDate?: string
  ): Promise<SettlementSummary[]> {
    let dateFilter = '';
    const params: any[] = [orgId];

    if (fromDate) {
      params.push(fromDate);
      dateFilter += ` AND fl.created_at >= $${params.length}`;
    }
    if (toDate) {
      params.push(`${toDate} 23:59:59.999Z`);
      dateFilter += ` AND fl.created_at <= $${params.length}`;
    }
    if (targetUserId) {
      params.push(targetUserId);
      dateFilter += ` AND fl.user_id = $${params.length}`;
    }

    const sql = `
      SELECT u.id AS user_id, u.username,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'TICKET_SALE' THEN fl.amount ELSE 0 END), 0) AS total_sales,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'CANCELLATION_REVERSAL' THEN fl.amount ELSE 0 END), 0) AS cancellation_reversals,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'PRIZE_PAYABLE' THEN fl.amount ELSE 0 END), 0) AS total_prizes,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'COMMISSION_PAYABLE' THEN fl.amount ELSE 0 END), 0) AS total_commission,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'PAYMENT_TO_USER' THEN fl.amount ELSE 0 END), 0) AS paid_to_user,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'PAYMENT_FROM_USER' THEN fl.amount ELSE 0 END), 0) AS received_from_user
      FROM users u
      LEFT JOIN financial_ledger fl ON fl.user_id = u.id AND fl.org_id = u.org_id ${dateFilter}
      WHERE u.org_id = $1 AND u.role = 'USER'
      GROUP BY u.id, u.username
      ORDER BY u.username ASC
    `;

    const res = await query(sql, params);

    return res.rows.map((r) => {
      // Net sales liability = total_sales - cancellations (or cancellations is negative)
      const rawSales = parseFloat(r.total_sales);
      const reversals = Math.abs(parseFloat(r.cancellation_reversals));
      const netSales = Math.max(0, rawSales - reversals);

      const prizes = parseFloat(r.total_prizes);
      const commission = parseFloat(r.total_commission);

      // Formula: (Total Prizes + Total Commission) - Net Sales Liability
      // Positive: Admin owes User
      // Negative: User owes Admin
      const netBalance = prizes + commission - netSales;

      const paidToUser = parseFloat(r.paid_to_user);
      const receivedFromUser = parseFloat(r.received_from_user);
      const netPaid = paidToUser - receivedFromUser;

      // Outstanding balance remaining to be cleared
      const outstanding = netBalance - netPaid;

      return {
        userId: r.user_id,
        username: r.username,
        totalSales: netSales,
        totalPrizes: prizes,
        totalCommission: commission,
        netBalance: Math.round(netBalance * 100) / 100,
        paidAmount: Math.round(netPaid * 100) / 100,
        outstandingBalance: Math.round(outstanding * 100) / 100,
      };
    });
  }

  /**
   * Record a financial payment transaction between Admin and User
   */
  static async recordPayment(
    orgId: string,
    adminId: string,
    targetUserId: string,
    amount: number,
    direction: 'TO_USER' | 'FROM_USER',
    notes?: string
  ) {
    if (amount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    const entryType = direction === 'TO_USER' ? 'PAYMENT_TO_USER' : 'PAYMENT_FROM_USER';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const refId = `PAY-${Date.now()}`;
      await client.query(
        `INSERT INTO financial_ledger (
           org_id, user_id, entry_type, amount, reference_id, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orgId, targetUserId, entryType, amount, refId, notes || `Payment recorded by admin`]
      );

      await client.query(
        `INSERT INTO audit_logs (
           org_id, actor_id, action, entity, entity_id, details
         )
         VALUES ($1, $2, 'RECORD_PAYMENT', 'financial_ledger', $3, $4)`,
        [orgId, adminId, refId, JSON.stringify({ targetUserId, amount, direction, notes })]
      );

      await client.query('COMMIT');
      return { success: true, referenceId: refId, amount, direction };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get detailed financial ledger entries for an agent
   */
  static async getLedger(orgId: string, userId: string, limit = 50) {
    const res = await query(
      `SELECT fl.id, fl.entry_type, fl.amount, fl.reference_id, fl.notes, fl.created_at,
              d.draw_time, g.name AS game_name
       FROM financial_ledger fl
       LEFT JOIN draws d ON d.id = fl.draw_id
       LEFT JOIN games g ON g.id = d.game_id
       WHERE fl.org_id = $1 AND fl.user_id = $2
       ORDER BY fl.created_at DESC
       LIMIT $3`,
      [orgId, userId, limit]
    );
    return res.rows;
  }
}
