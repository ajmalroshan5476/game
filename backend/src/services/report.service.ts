import { query } from '../db/pool.js';

export class ReportService {
  /**
   * 1. Sales Report
   */
  static async getSalesReport(
    orgId: string,
    userId?: string,
    filters?: {
      gameId?: string;
      drawTime?: string;
      drawId?: string;
      fromDate?: string;
      toDate?: string;
      date?: string;
      ticketNumber?: string;
      group?: string;
      mode?: string;
      page?: number;
      limit?: number;
    }
  ) {
    let whereClause = `WHERE t.org_id = $1 AND t.status = 'ACTIVE'`;
    const params: any[] = [orgId];

    if (userId) {
      params.push(userId);
      whereClause += ` AND t.user_id = $${params.length}`;
    }
    if (filters?.gameId && filters.gameId !== 'ALL' && filters.gameId !== 'undefined') {
      params.push(filters.gameId);
      whereClause += ` AND (g.id::text = $${params.length} OR g.code ILIKE $${params.length} OR g.name ILIKE $${params.length})`;
    }
    if (filters?.drawTime && filters.drawTime !== 'ALL' && filters.drawTime !== 'undefined') {
      params.push(filters.drawTime);
      whereClause += ` AND d.draw_time = $${params.length}`;
    }
    if (filters?.drawId && filters.drawId !== 'undefined') {
      params.push(filters.drawId);
      whereClause += ` AND d.id = $${params.length}`;
    }

    const effectiveFrom = filters?.fromDate || filters?.date;
    const effectiveTo = filters?.toDate || filters?.date;

    if (effectiveFrom && effectiveFrom !== 'undefined') {
      params.push(effectiveFrom);
      whereClause += ` AND d.draw_date >= $${params.length}`;
    }
    if (effectiveTo && effectiveTo !== 'undefined') {
      params.push(effectiveTo);
      whereClause += ` AND d.draw_date <= $${params.length}`;
    }
    if (filters?.ticketNumber && filters.ticketNumber.trim()) {
      params.push(`%${filters.ticketNumber.trim()}%`);
      whereClause += ` AND t.ticket_number ILIKE $${params.length}`;
    }
    if (filters?.group && ['1', '2', '3'].includes(filters.group)) {
      params.push(parseInt(filters.group, 10));
      whereClause += ` AND EXISTS (SELECT 1 FROM ticket_entries te_grp WHERE te_grp.ticket_id = t.id AND LENGTH(te_grp.number) = $${params.length})`;
    }
    if (filters?.mode && filters.mode !== 'ALL' && filters.mode !== 'undefined') {
      params.push(filters.mode.trim());
      whereClause += ` AND EXISTS (SELECT 1 FROM ticket_entries te_filter WHERE te_filter.ticket_id = t.id AND te_filter.mode = $${params.length})`;
    }

    const sql = `
      SELECT t.id, t.ticket_number, t.customer_name, t.total_quantity, t.total_amount,
             t.status, t.created_at,
             d.draw_date, d.draw_time,
             g.name AS game_name, g.color AS game_color,
             u.username AS seller_username,
             (
               SELECT json_agg(json_build_object(
                 'number', te.number,
                 'quantity', te.quantity,
                 'mode', te.mode,
                 'is_box', te.is_box,
                 'total_price', te.total_price
               ) ORDER BY te.created_at ASC)
               FROM ticket_entries te
               WHERE te.ticket_id = t.id
             ) AS entries
      FROM tickets t
      JOIN draws d ON d.id = t.draw_id
      JOIN games g ON g.id = d.game_id
      JOIN users u ON u.id = t.user_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ${filters?.limit || 100}
    `;

    const res = await query(sql, params);

    // Filter-aware summary
    const summarySql = `
      SELECT COUNT(DISTINCT t.id) AS total_bills,
             COALESCE(SUM(t.total_quantity), 0) AS total_quantity,
             COALESCE(SUM(t.total_amount), 0) AS total_sales
      FROM tickets t
      JOIN draws d ON d.id = t.draw_id
      JOIN games g ON g.id = d.game_id
      JOIN users u ON u.id = t.user_id
      ${whereClause}
    `;
    const summaryRes = await query(summarySql, params);

    return {
      summary: summaryRes.rows[0] || { total_bills: 0, total_quantity: 0, total_sales: 0 },
      items: res.rows,
    };
  }

  /**
   * 2. Winnings Report
   */
  static async getWinningsReport(
    orgId: string,
    userId?: string,
    filters?: {
      gameId?: string;
      drawTime?: string;
      fromDate?: string;
      toDate?: string;
      date?: string;
      ticketNumber?: string;
      group?: string;
      mode?: string;
    }
  ) {
    let whereClause = `WHERE wr.org_id = $1`;
    const params: any[] = [orgId];

    if (userId) {
      params.push(userId);
      whereClause += ` AND wr.user_id = $${params.length}`;
    }
    if (filters?.gameId && filters.gameId !== 'ALL' && filters.gameId !== 'undefined') {
      params.push(filters.gameId);
      whereClause += ` AND (g.id::text = $${params.length} OR g.code ILIKE $${params.length} OR g.name ILIKE $${params.length})`;
    }
    if (filters?.drawTime && filters.drawTime !== 'ALL' && filters.drawTime !== 'undefined') {
      params.push(filters.drawTime);
      whereClause += ` AND d.draw_time = $${params.length}`;
    }

    const effectiveFrom = filters?.fromDate || filters?.date;
    const effectiveTo = filters?.toDate || filters?.date;

    if (effectiveFrom && effectiveFrom !== 'undefined') {
      params.push(effectiveFrom);
      whereClause += ` AND d.draw_date >= $${params.length}`;
    }
    if (effectiveTo && effectiveTo !== 'undefined') {
      params.push(effectiveTo);
      whereClause += ` AND d.draw_date <= $${params.length}`;
    }
    if (filters?.ticketNumber && filters.ticketNumber.trim()) {
      params.push(`%${filters.ticketNumber.trim()}%`);
      whereClause += ` AND t.ticket_number ILIKE $${params.length}`;
    }
    if (filters?.group && ['1', '2', '3'].includes(filters.group)) {
      params.push(parseInt(filters.group, 10));
      whereClause += ` AND LENGTH(te.number) = $${params.length}`;
    }
    if (filters?.mode && filters.mode !== 'ALL' && filters.mode !== 'undefined') {
      params.push(filters.mode.trim());
      whereClause += ` AND te.mode = $${params.length}`;
    }

    const sql = `
      SELECT wr.id, wr.prize_position, wr.prize_amount, wr.commission_amount, wr.created_at,
             t.ticket_number, t.customer_name,
             te.number AS winning_number, te.quantity, te.mode,
             d.draw_date, d.draw_time,
             g.name AS game_name, g.color AS game_color,
             u.username AS seller_username
      FROM winning_records wr
      JOIN tickets t ON t.id = wr.ticket_id
      JOIN ticket_entries te ON te.id = wr.entry_id
      JOIN official_results r ON r.id = wr.result_id
      JOIN draws d ON d.id = r.draw_id
      JOIN games g ON g.id = d.game_id
      JOIN users u ON u.id = wr.user_id
      ${whereClause}
      ORDER BY wr.created_at DESC
      LIMIT 100
    `;

    const res = await query(sql, params);

    let totalPrize = 0;
    let totalCommission = 0;
    for (const row of res.rows) {
      totalPrize += parseFloat(row.prize_amount);
      totalCommission += parseFloat(row.commission_amount);
    }

    return {
      summary: {
        totalWinningEntries: res.rows.length,
        totalPrize,
        totalCommission,
      },
      items: res.rows,
    };
  }

  /**
   * 3. Winning Bill-Wise
   */
  static async getWinningBillWise(
    orgId: string,
    userId?: string,
    filters?: {
      gameId?: string;
      drawTime?: string;
      date?: string;
      fromDate?: string;
      toDate?: string;
      ticketNumber?: string;
      group?: string;
      mode?: string;
    }
  ) {
    let whereClause = `WHERE wr.org_id = $1`;
    const params: any[] = [orgId];

    if (userId) {
      params.push(userId);
      whereClause += ` AND wr.user_id = $${params.length}`;
    }
    if (filters?.drawTime && filters.drawTime !== 'ALL' && filters.drawTime !== 'undefined') {
      params.push(filters.drawTime);
      whereClause += ` AND d.draw_time = $${params.length}`;
    }
    if (filters?.gameId && filters.gameId !== 'ALL' && filters.gameId !== 'undefined') {
      params.push(filters.gameId);
      whereClause += ` AND (g.id::text = $${params.length} OR g.code ILIKE $${params.length} OR g.name ILIKE $${params.length})`;
    }

    const effectiveDate = filters?.date || filters?.fromDate;
    if (effectiveDate && effectiveDate !== 'undefined') {
      params.push(effectiveDate);
      whereClause += ` AND d.draw_date = $${params.length}`;
    }
    if (filters?.ticketNumber && filters.ticketNumber.trim()) {
      params.push(`%${filters.ticketNumber.trim()}%`);
      whereClause += ` AND t.ticket_number ILIKE $${params.length}`;
    }
    if (filters?.group && ['1', '2', '3'].includes(filters.group)) {
      params.push(parseInt(filters.group, 10));
      whereClause += ` AND EXISTS (SELECT 1 FROM ticket_entries te_grp WHERE te_grp.ticket_id = t.id AND LENGTH(te_grp.number) = $${params.length})`;
    }
    if (filters?.mode && filters.mode !== 'ALL' && filters.mode !== 'undefined') {
      params.push(filters.mode.trim());
      whereClause += ` AND EXISTS (SELECT 1 FROM ticket_entries te_m WHERE te_m.ticket_id = t.id AND te_m.mode = $${params.length})`;
    }

    const sql = `
      SELECT t.id AS ticket_id, t.ticket_number, t.customer_name, t.total_amount,
             d.draw_date, d.draw_time, g.name AS game_name,
             u.username AS seller_username,
             COALESCE(SUM(wr.prize_amount), 0) AS total_bill_prize,
             COALESCE(SUM(wr.commission_amount), 0) AS total_bill_commission,
             COUNT(wr.id) AS winning_entries_count
      FROM winning_records wr
      JOIN tickets t ON t.id = wr.ticket_id
      JOIN draws d ON d.id = t.draw_id
      JOIN games g ON g.id = d.game_id
      JOIN users u ON u.id = wr.user_id
      ${whereClause}
      GROUP BY t.id, t.ticket_number, t.customer_name, t.total_amount, d.draw_date, d.draw_time, g.name, u.username
      ORDER BY total_bill_prize DESC
      LIMIT 100
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * 4. Number-Wise Report
   */
  static async getNumberWiseReport(
    orgId: string,
    userId?: string,
    filters?: {
      gameId?: string;
      drawTime?: string;
      drawId?: string;
      date?: string;
      ticketNumber?: string;
      group?: string;
      mode?: string;
      groupWithoutTicketName?: boolean;
    }
  ) {
    let whereClause = `WHERE t.org_id = $1 AND t.status = 'ACTIVE'`;
    const params: any[] = [orgId];

    if (userId) {
      params.push(userId);
      whereClause += ` AND t.user_id = $${params.length}`;
    }
    if (filters?.drawId && filters.drawId !== 'undefined') {
      params.push(filters.drawId);
      whereClause += ` AND t.draw_id = $${params.length}`;
    }
    if (filters?.gameId && filters.gameId !== 'ALL' && filters.gameId !== 'undefined') {
      params.push(filters.gameId);
      whereClause += ` AND (g.id::text = $${params.length} OR g.code ILIKE $${params.length} OR g.name ILIKE $${params.length})`;
    }
    if (filters?.drawTime && filters.drawTime !== 'ALL' && filters.drawTime !== 'undefined') {
      params.push(filters.drawTime);
      whereClause += ` AND d.draw_time = $${params.length}`;
    }
    if (filters?.date && filters.date !== 'undefined') {
      params.push(filters.date);
      whereClause += ` AND d.draw_date = $${params.length}`;
    }
    if (filters?.ticketNumber && filters.ticketNumber.trim()) {
      params.push(`%${filters.ticketNumber.trim()}%`);
      whereClause += ` AND t.ticket_number ILIKE $${params.length}`;
    }
    if (filters?.group && ['1', '2', '3'].includes(filters.group)) {
      params.push(parseInt(filters.group, 10));
      whereClause += ` AND LENGTH(te.number) = $${params.length}`;
    }
    if (filters?.mode && filters.mode !== 'ALL' && filters.mode !== 'undefined') {
      params.push(filters.mode.trim());
      whereClause += ` AND te.mode = $${params.length}`;
    }

    const sql = `
      SELECT te.number,
             SUM(te.quantity) AS total_quantity,
             COUNT(te.id) AS booking_count,
             SUM(te.total_price) AS total_amount,
             MAX(te.mode) AS sample_mode
      FROM ticket_entries te
      JOIN tickets t ON t.id = te.ticket_id
      JOIN draws d ON d.id = t.draw_id
      JOIN games g ON g.id = d.game_id
      ${whereClause}
      GROUP BY te.number
      ORDER BY total_quantity DESC
      LIMIT 100
    `;

    const res = await query(sql, params);
    return res.rows;
  }

  /**
   * 5. Net Pay Report
   */
  static async getNetPayReport(
    orgId: string,
    userId?: string,
    filters?: {
      gameId?: string;
      fromDate?: string;
      toDate?: string;
      group?: string;
      mode?: string;
    }
  ) {
    let dateFilter = '';
    const params: any[] = [orgId];

    if (filters?.fromDate && filters.fromDate !== 'undefined') {
      params.push(filters.fromDate);
      dateFilter += ` AND fl.created_at >= $${params.length}`;
    }
    if (filters?.toDate && filters.toDate !== 'undefined') {
      params.push(`${filters.toDate} 23:59:59.999Z`);
      dateFilter += ` AND fl.created_at <= $${params.length}`;
    }
    if (userId) {
      params.push(userId);
      dateFilter += ` AND fl.user_id = $${params.length}`;
    }
    if (filters?.gameId && filters.gameId !== 'ALL' && filters.gameId !== 'undefined') {
      params.push(filters.gameId);
      dateFilter += ` AND (g.id::text = $${params.length} OR g.code ILIKE $${params.length} OR g.name ILIKE $${params.length})`;
    }

    const sql = `
      SELECT COALESCE(g.name, 'All Games') AS game_name,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'TICKET_SALE' THEN fl.amount ELSE 0 END), 0)
             - COALESCE(ABS(SUM(CASE WHEN fl.entry_type = 'CANCELLATION_REVERSAL' THEN fl.amount ELSE 0 END)), 0) AS total_sales,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'PRIZE_PAYABLE' THEN fl.amount ELSE 0 END), 0) AS total_prizes,
             COALESCE(SUM(CASE WHEN fl.entry_type = 'COMMISSION_PAYABLE' THEN fl.amount ELSE 0 END), 0) AS total_commission
      FROM financial_ledger fl
      LEFT JOIN draws d ON d.id = fl.draw_id
      LEFT JOIN games g ON g.id = d.game_id
      WHERE fl.org_id = $1 ${dateFilter}
      GROUP BY g.name
      ORDER BY total_sales DESC
    `;

    const res = await query(sql, params);

    return res.rows.map((row) => {
      const sales = Math.max(0, parseFloat(row.total_sales));
      const prize = parseFloat(row.total_prizes);
      const commission = parseFloat(row.total_commission);
      const netPay = prize + commission - sales;
      return {
        gameName: row.game_name,
        totalSales: sales,
        totalPrizes: prize,
        totalCommission: commission,
        netPay: Math.round(netPay * 100) / 100,
      };
    });
  }
}
