import { query } from '../db/pool.js';
import bcrypt from 'bcryptjs';

export interface UserRecord {
  id: string;
  org_id: string;
  username: string;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  created_at: string;
}

export class AuthService {
  static async validateCredentials(username: string, pass: string): Promise<UserRecord | null> {
    const res = await query(
      `SELECT id, org_id, username, password_hash, role, status, created_at
       FROM users
       WHERE UPPER(username) = UPPER($1)`,
      [username.trim()]
    );

    if (res.rows.length === 0) return null;
    const user = res.rows[0];

    if (user.status !== 'ACTIVE') {
      throw new Error(`Account is ${user.status.toLowerCase()}`);
    }

    const valid = await bcrypt.compare(pass, user.password_hash);
    if (!valid) return null;

    return {
      id: user.id,
      org_id: user.org_id,
      username: user.username,
      role: user.role,
      status: user.status,
      created_at: user.created_at,
    };
  }

  static async createUser(
    orgId: string,
    adminId: string,
    rawUsername: string,
    initialPassword: string
  ): Promise<UserRecord> {
    const username = rawUsername.trim().toUpperCase();

    // Enforce 4-character uppercase alphanumeric (A-Z, 0-9)
    if (!/^[A-Z0-9]{4}$/.test(username)) {
      throw new Error('Username must contain exactly 4 alphanumeric characters (A-Z, 0-9)');
    }

    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username]);
    if (existing.rows.length > 0) {
      throw new Error(`Username ${username} is already taken`);
    }

    if (!initialPassword || initialPassword.length < 6) {
      throw new Error('Initial password must be at least 6 characters');
    }

    const passwordHash = await bcrypt.hash(initialPassword, 10);

    // Ensure valid orgId from admin record or organization table
    let targetOrgId = orgId;
    const adminRes = await query(`SELECT org_id FROM users WHERE id = $1`, [adminId]);
    if (adminRes.rows.length > 0) {
      targetOrgId = adminRes.rows[0].org_id;
    } else {
      const orgRes = await query(`SELECT id FROM organizations LIMIT 1`);
      if (orgRes.rows.length > 0) {
        targetOrgId = orgRes.rows[0].id;
      }
    }

    const res = await query(
      `INSERT INTO users (org_id, username, password_hash, role, status, created_by)
       VALUES ($1, $2, $3, 'USER', 'ACTIVE', $4)
       RETURNING id, org_id, username, role, status, created_at`,
      [targetOrgId, username, passwordHash, adminId]
    );

    return res.rows[0];
  }

  static async listUsers(orgId: string): Promise<any[]> {
    const res = await query(
      `SELECT u.id, u.username, u.role, u.status, u.created_at,
              COALESCE(SUM(t.total_amount), 0) AS total_sales,
              COUNT(t.id) AS ticket_count
       FROM users u
       LEFT JOIN tickets t ON t.user_id = u.id AND t.status = 'ACTIVE'
       WHERE u.org_id = $1 AND u.role = 'USER'
       GROUP BY u.id, u.username, u.role, u.status, u.created_at
       ORDER BY u.created_at DESC`,
      [orgId]
    );
    return res.rows;
  }

  static async updateUserStatus(
    orgId: string,
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE'
  ): Promise<void> {
    await query(
      `UPDATE users SET status = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3`,
      [status, userId, orgId]
    );
  }

  static async resetPassword(orgId: string, userId: string, newPass: string): Promise<void> {
    if (!newPass || newPass.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const hash = await bcrypt.hash(newPass, 10);
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE id = $2 AND org_id = $3`,
      [hash, userId, orgId]
    );
  }
}
