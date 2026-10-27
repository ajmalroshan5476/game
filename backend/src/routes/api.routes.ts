import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';
import { TicketService, LimitExceededError } from '../services/ticket.service.js';
import { LimitService } from '../services/limit.service.js';
import { ResultService } from '../services/result.service.js';
import { FinanceService } from '../services/finance.service.js';
import { ReportService } from '../services/report.service.js';
import { query } from '../db/pool.js';
import bcrypt from 'bcryptjs';

interface AuthUser {
  userId: string;
  orgId: string;
  username: string;
  role: 'ADMIN' | 'USER';
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

export async function apiRoutes(fastify: FastifyInstance) {
  // Auth Decorator
  const authenticate = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing or invalid token' });
      }
      const token = authHeader.substring(7);
      const decoded = fastify.jwt.verify<AuthUser>(token);

      // Verify active user in DB to avoid stale tokens across DB resets
      const userCheck = await query(
        `SELECT id, org_id, username, role, status FROM users WHERE id = $1`,
        [decoded.userId]
      );
      if (userCheck.rows.length === 0 || userCheck.rows[0].status !== 'ACTIVE') {
        return reply.status(401).send({ error: 'Session expired or invalidated. Please log in again.' });
      }

      req.user = {
        userId: userCheck.rows[0].id,
        orgId: userCheck.rows[0].org_id,
        username: userCheck.rows[0].username,
        role: userCheck.rows[0].role,
      };
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized token' });
    }
  };

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    await authenticate(req, reply);
    if (reply.sent) return;
    if (req.user?.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Admin access required' });
    }
  };

  // --------------------------------------------------------------------------
  // 1. Authentication & First-Time Setup
  // --------------------------------------------------------------------------
  fastify.get('/api/auth/setup-status', async () => {
    const res = await query(`SELECT count(*) FROM users`);
    const count = parseInt(res.rows[0].count, 10);
    return { needsSetup: count === 0 };
  });

  fastify.post('/api/auth/setup-admin', async (req, reply) => {
    const userCount = await query(`SELECT count(*) FROM users`);
    if (parseInt(userCount.rows[0].count, 10) > 0) {
      return reply.status(403).send({ error: 'Admin already configured. Please log in.' });
    }

    const { username, password } = (req.body as any) || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    const orgRes = await query(`SELECT id FROM organizations LIMIT 1`);
    if (orgRes.rows.length === 0) {
      return reply.status(500).send({ error: 'Organization not found. Run migrations first.' });
    }

    const cleanUsername = username.trim().toUpperCase();
    if (cleanUsername.length > 10) {
      return reply.status(400).send({ error: 'Username cannot exceed 10 characters' });
    }

    const orgId = orgRes.rows[0].id;
    const passHash = await bcrypt.hash(password, 10);

    const newAdmin = await query(
      `INSERT INTO users (org_id, username, password_hash, role, status)
       VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE')
       RETURNING id, org_id, username, role`,
      [orgId, cleanUsername, passHash]
    );

    const user = newAdmin.rows[0];
    const token = fastify.jwt.sign({
      userId: user.id,
      orgId: user.org_id,
      username: user.username,
      role: user.role,
    });

    return {
      token,
      user: {
        id: user.id,
        orgId: user.org_id,
        username: user.username,
        role: user.role,
      },
    };
  });

  fastify.post('/api/auth/login', async (req, reply) => {
    const { username, password } = (req.body as any) || {};
    if (!username || !password) {
      return reply.status(400).send({ error: 'Username and password are required' });
    }

    try {
      const user = await AuthService.validateCredentials(username, password);
      if (!user) {
        return reply.status(401).send({ error: 'Invalid username or password' });
      }

      const token = fastify.jwt.sign({
        userId: user.id,
        orgId: user.org_id,
        username: user.username,
        role: user.role,
      });

      return {
        token,
        user: {
          id: user.id,
          orgId: user.org_id,
          username: user.username,
          role: user.role,
        },
      };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/api/auth/me', { preHandler: authenticate }, async (req) => {
    return { user: req.user };
  });

  // --------------------------------------------------------------------------
  // 2. Games and Draws
  // --------------------------------------------------------------------------
  fastify.get('/api/games', { preHandler: authenticate }, async (req) => {
    const orgId = req.user!.orgId;
    const todayStr = new Date().toISOString().split('T')[0];

    // Ensure today's draws exist for all active games
    const activeGames = await query(`SELECT id, code, name FROM games WHERE org_id = $1 AND is_active = TRUE`, [orgId]);
    for (const g of activeGames.rows) {
      const existRes = await query(
        `SELECT id FROM draws WHERE game_id = $1 AND draw_date = $2`,
        [g.id, todayStr]
      );
      if (existRes.rows.length === 0) {
        let drawTime = '15:00:00';
        let cutoffTime = `${todayStr}T15:03:00+05:30`;
        let editCutoffTime = `${todayStr}T15:00:00+05:30`;
        if (g.name.includes('1 PM') || g.code.includes('1PM')) {
          drawTime = '13:00:00';
          cutoffTime = `${todayStr}T12:58:00+05:30`;
          editCutoffTime = `${todayStr}T12:55:00+05:30`;
        } else if (g.name.includes('6 PM') || g.code.includes('6PM')) {
          drawTime = '18:00:00';
          cutoffTime = `${todayStr}T17:58:00+05:30`;
          editCutoffTime = `${todayStr}T17:55:00+05:30`;
        } else if (g.name.includes('8 PM') || g.code.includes('8PM')) {
          drawTime = '20:00:00';
          cutoffTime = `${todayStr}T19:58:00+05:30`;
          editCutoffTime = `${todayStr}T19:55:00+05:30`;
        }
        await query(
          `INSERT INTO draws (game_id, draw_date, draw_time, cutoff_time, edit_cutoff_time, status)
           VALUES ($1, $2, $3, $4, $5, 'OPEN')
           ON CONFLICT DO NOTHING`,
          [g.id, todayStr, drawTime, cutoffTime, editCutoffTime]
        );
      } else {
        // Keep cutoffs synced
        let cutoffTime = `${todayStr}T15:03:00+05:30`;
        let editCutoffTime = `${todayStr}T15:00:00+05:30`;
        if (g.name.includes('1 PM') || g.code.includes('1PM')) {
          cutoffTime = `${todayStr}T12:58:00+05:30`;
          editCutoffTime = `${todayStr}T12:55:00+05:30`;
        } else if (g.name.includes('6 PM') || g.code.includes('6PM')) {
          cutoffTime = `${todayStr}T17:58:00+05:30`;
          editCutoffTime = `${todayStr}T17:55:00+05:30`;
        } else if (g.name.includes('8 PM') || g.code.includes('8PM')) {
          cutoffTime = `${todayStr}T19:58:00+05:30`;
          editCutoffTime = `${todayStr}T19:55:00+05:30`;
        }
        await query(
          `UPDATE draws SET cutoff_time = $1, edit_cutoff_time = $2 WHERE id = $3`,
          [cutoffTime, editCutoffTime, existRes.rows[0].id]
        );
      }
    }

    const res = await query(
      `SELECT g.id, g.name, g.code, g.color, g.is_active,
              (
                SELECT json_agg(json_build_object(
                  'id', d.id,
                  'drawDate', d.draw_date,
                  'drawTime', d.draw_time,
                  'cutoffTime', d.cutoff_time,
                  'editCutoffTime', d.edit_cutoff_time,
                  'status', d.status,
                  'isCutoffPassed', (NOW() >= d.cutoff_time)
                ) ORDER BY d.draw_date DESC, d.draw_time ASC)
                FROM draws d
                WHERE d.game_id = g.id AND d.draw_date >= CURRENT_DATE
              ) AS draws
       FROM games g
       WHERE g.org_id = $1 AND g.is_active = TRUE
       ORDER BY g.name ASC`,
      [orgId]
    );

    return {
      serverTime: new Date().toISOString(),
      games: res.rows.map((r) => ({
        ...r,
        draws: r.draws || [],
      })),
    };
  });

  fastify.get('/api/draws', { preHandler: authenticate }, async (req) => {
    const orgId = req.user!.orgId;
    const { date } = req.query as any;
    const drawDate = date || new Date().toISOString().split('T')[0];

    const res = await query(
      `SELECT d.id, d.game_id, d.draw_date, d.draw_time, d.cutoff_time, d.edit_cutoff_time, d.status,
              g.name AS game_name, g.color AS game_color
       FROM draws d
       JOIN games g ON g.id = d.game_id
       WHERE g.org_id = $1 AND d.draw_date = $2
       ORDER BY d.draw_time ASC`,
      [orgId, drawDate]
    );

    return {
      serverTime: new Date().toISOString(),
      draws: res.rows,
    };
  });

  // --------------------------------------------------------------------------
  // 3. Ticket Operations (Submit, Search, Cancel)
  // --------------------------------------------------------------------------
  fastify.post('/api/tickets', { preHandler: authenticate }, async (req, reply) => {
    const { orgId, userId } = req.user!;
    const payload = req.body as any;

    if (!payload?.drawId || !Array.isArray(payload.entries) || payload.entries.length === 0) {
      return reply.status(400).send({ error: 'drawId and at least one entry are required' });
    }

    try {
      const result = await TicketService.submitTicket(orgId, userId, payload);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err instanceof LimitExceededError) {
        return reply.status(409).send({
          error: 'NUMBER_LIMIT_EXCEEDED',
          message: err.message,
          number: err.number,
          maxQuantity: err.maxQuantity,
          currentlyAccepted: err.currentlyAccepted,
          requested: err.requested,
          remaining: err.remaining,
        });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.get('/api/tickets/:ticketNumber', { preHandler: authenticate }, async (req, reply) => {
    const { orgId, userId, role } = req.user!;
    const { ticketNumber } = req.params as any;

    try {
      const ticket = await TicketService.getTicketByNumber(orgId, userId, ticketNumber, role === 'ADMIN');
      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }
      return ticket;
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
  });

  fastify.post('/api/tickets/:ticketNumber/cancel', { preHandler: authenticate }, async (req, reply) => {
    const { orgId, userId, role } = req.user!;
    const { ticketNumber } = req.params as any;

    try {
      const result = await TicketService.cancelTicket(orgId, userId, ticketNumber, role === 'ADMIN');
      return result;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // 4. Number Limits (Admin & User query)
  // --------------------------------------------------------------------------
  fastify.get('/api/limits', { preHandler: authenticate }, async (req, reply) => {
    const { orgId } = req.user!;
    const { drawId } = req.query as any;

    if (!drawId) {
      return reply.status(400).send({ error: 'drawId query parameter is required' });
    }

    const limits = await LimitService.getLimitsForDraw(orgId, drawId);
    return { limits };
  });

  fastify.post('/api/admin/limits', { preHandler: requireAdmin }, async (req, reply) => {
    const { orgId } = req.user!;
    const { drawId, number, maxQuantity } = (req.body as any) || {};

    if (!drawId || !number || maxQuantity === undefined) {
      return reply.status(400).send({ error: 'drawId, number, and maxQuantity are required' });
    }

    try {
      await LimitService.setLimit(orgId, drawId, number, parseInt(maxQuantity, 10));
      return { success: true, message: `Limit set for number ${number}` };
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/api/admin/limits/reconcile', { preHandler: requireAdmin }, async (req, reply) => {
    const { orgId } = req.user!;
    const { drawId } = (req.body as any) || {};

    if (!drawId) {
      return reply.status(400).send({ error: 'drawId is required' });
    }

    const result = await LimitService.reconcileCounters(orgId, drawId);
    return { success: true, ...result };
  });

  // --------------------------------------------------------------------------
  // 5. Official Results
  // --------------------------------------------------------------------------
  fastify.get('/api/results', { preHandler: authenticate }, async (req) => {
    const { orgId } = req.user!;
    const { date, gameId } = req.query as any;
    const results = await ResultService.getResults(orgId, date, gameId);
    return { results };
  });

  fastify.get('/api/results/check/:drawId', { preHandler: authenticate }, async (req, reply) => {
    const { orgId } = req.user!;
    const { drawId } = req.params as any;

    if (!drawId) {
      return reply.status(400).send({ error: 'drawId is required' });
    }

    try {
      const data = await ResultService.getCheckResult(orgId, drawId);
      return data;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.post('/api/admin/results', { preHandler: requireAdmin }, async (req, reply) => {
    const { orgId, userId } = req.user!;
    const payload = req.body as any;

    if (!payload?.drawId || !payload?.firstPrize) {
      return reply.status(400).send({ error: 'drawId and firstPrize are required' });
    }

    try {
      const summary = await ResultService.publishResult(orgId, userId, payload);
      return reply.status(201).send(summary);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // 6. Settlements and Financial Ledger
  // --------------------------------------------------------------------------
  fastify.get('/api/settlements', { preHandler: authenticate }, async (req) => {
    const { orgId, userId, role } = req.user!;
    const { fromDate, toDate, targetUserId } = req.query as any;

    // Regular users can only see their own settlement
    const effectiveUserId = role === 'ADMIN' ? targetUserId : userId;

    const summary = await FinanceService.getSettlementSummary(
      orgId,
      effectiveUserId,
      fromDate,
      toDate
    );

    return { settlements: summary };
  });

  fastify.get('/api/ledger', { preHandler: authenticate }, async (req) => {
    const { orgId, userId } = req.user!;
    const ledger = await FinanceService.getLedger(orgId, userId);
    return { ledger };
  });

  fastify.post('/api/admin/payments', { preHandler: requireAdmin }, async (req, reply) => {
    const { orgId, userId: adminId } = req.user!;
    const { targetUserId, amount, direction, notes } = (req.body as any) || {};

    if (!targetUserId || !amount || !direction) {
      return reply.status(400).send({ error: 'targetUserId, amount, and direction are required' });
    }

    try {
      const res = await FinanceService.recordPayment(
        orgId,
        adminId,
        targetUserId,
        parseFloat(amount),
        direction,
        notes
      );
      return res;
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // 7. Reports
  // --------------------------------------------------------------------------
  fastify.get('/api/reports/sales', { preHandler: authenticate }, async (req) => {
    const { orgId, userId, role } = req.user!;
    const queryParams = req.query as any;
    const effectiveUserId = role === 'ADMIN' ? queryParams.userId : userId;

    return await ReportService.getSalesReport(orgId, effectiveUserId, queryParams);
  });

  fastify.get('/api/reports/winnings', { preHandler: authenticate }, async (req) => {
    const { orgId, userId, role } = req.user!;
    const queryParams = req.query as any;
    const effectiveUserId = role === 'ADMIN' ? queryParams.userId : userId;

    return await ReportService.getWinningsReport(orgId, effectiveUserId, queryParams);
  });

  fastify.get('/api/reports/bill-wise', { preHandler: authenticate }, async (req) => {
    const { orgId, userId, role } = req.user!;
    const queryParams = req.query as any;
    const effectiveUserId = role === 'ADMIN' ? queryParams.userId : userId;

    return await ReportService.getWinningBillWise(orgId, effectiveUserId, queryParams);
  });

  fastify.get('/api/reports/number-wise', { preHandler: authenticate }, async (req) => {
    const { orgId, userId, role } = req.user!;
    const queryParams = req.query as any;
    const effectiveUserId = role === 'ADMIN' ? queryParams.userId : userId;
    return await ReportService.getNumberWiseReport(orgId, effectiveUserId, queryParams);
  });

  fastify.get('/api/reports/net-pay', { preHandler: authenticate }, async (req) => {
    const { orgId, userId, role } = req.user!;
    const queryParams = req.query as any;
    const effectiveUserId = role === 'ADMIN' ? queryParams.targetUserId || queryParams.userId : userId;

    return await ReportService.getNetPayReport(orgId, effectiveUserId, queryParams);
  });

  // --------------------------------------------------------------------------
  // 8. Admin User Management
  // --------------------------------------------------------------------------
  fastify.get('/api/admin/users', { preHandler: requireAdmin }, async (req) => {
    const { orgId } = req.user!;
    const users = await AuthService.listUsers(orgId);
    return { users };
  });

  fastify.post('/api/admin/users', { preHandler: requireAdmin }, async (req, reply) => {
    const { orgId, userId: adminId } = req.user!;
    const { username, initialPassword } = (req.body as any) || {};

    if (!username || !initialPassword) {
      return reply.status(400).send({ error: '4-character username and initialPassword are required' });
    }

    try {
      const newUser = await AuthService.createUser(orgId, adminId, username, initialPassword);
      return reply.status(201).send({ user: newUser });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  fastify.patch('/api/admin/users/:id/status', { preHandler: requireAdmin }, async (req, reply) => {
    const { orgId } = req.user!;
    const { id } = req.params as any;
    const { status } = (req.body as any) || {};

    if (!['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' });
    }

    await AuthService.updateUserStatus(orgId, id, status);
    return { success: true };
  });

  fastify.post('/api/admin/users/:id/reset-password', { preHandler: requireAdmin }, async (req, reply) => {
    const { orgId } = req.user!;
    const { id } = req.params as any;
    const { newPassword } = (req.body as any) || {};

    if (!newPassword) {
      return reply.status(400).send({ error: 'newPassword is required' });
    }

    await AuthService.resetPassword(orgId, id, newPassword);
    return { success: true, message: 'Password reset successfully' };
  });
}
