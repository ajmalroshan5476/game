import { pool } from './pool.js';
import bcrypt from 'bcryptjs';

export async function createUser(usernameInput?: string, passwordInput?: string, roleInput?: string) {
  const username = (usernameInput || process.argv[2] || process.env.USERNAME_TO_CREATE || '').trim().toUpperCase();
  const password = (passwordInput || process.argv[3] || process.env.PASSWORD_TO_CREATE || '').trim();
  const role = ((roleInput || process.argv[4] || process.env.ROLE_TO_CREATE || 'ADMIN').trim().toUpperCase() as 'ADMIN' | 'USER');

  if (!username || !password) {
    console.error('Usage: npm run create:user <username> <password> [ADMIN|USER]');
    console.error('Example: npm run create:user AJMA 559092 ADMIN');
    process.exit(1);
  }

  if (username.length > 10) {
    console.error('Error: Username cannot exceed 10 characters.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const orgRes = await client.query(`SELECT id FROM organizations LIMIT 1`);
    if (orgRes.rows.length === 0) {
      console.error('Error: No organization found. Run npm run seed first.');
      process.exit(1);
    }
    const orgId = orgRes.rows[0].id;

    const existing = await client.query(`SELECT id FROM users WHERE username = $1`, [username]);
    const passHash = await bcrypt.hash(password, 10);

    if (existing.rows.length > 0) {
      await client.query(
        `UPDATE users SET password_hash = $1, role = $2, status = 'ACTIVE' WHERE username = $3`,
        [passHash, role, username]
      );
      console.log(`Successfully updated existing user: ${username} (${role})`);
    } else {
      await client.query(
        `INSERT INTO users (org_id, username, password_hash, role, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')`,
        [orgId, username, passHash, role]
      );
      console.log(`Successfully created new user: ${username} (${role})`);
    }
  } catch (err: any) {
    console.error('Error creating user:', err.message || err);
    process.exit(1);
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('create_user.ts') || process.argv[1]?.endsWith('create_user.js')) {
  createUser()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
