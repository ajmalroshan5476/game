import { pool } from './pool.js';

export async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('Running database migrations...');
    await client.query('BEGIN');

    // Extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // 1. Organizations
    await client.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        username VARCHAR(10) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'USER')),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
    `);

    // 3. Games
    await client.query(`
      CREATE TABLE IF NOT EXISTS games (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) NOT NULL,
        color VARCHAR(20) NOT NULL DEFAULT '#00A859',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_games_org ON games(org_id);
    `);

    // 4. Draws
    await client.query(`
      CREATE TABLE IF NOT EXISTS draws (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        draw_date DATE NOT NULL,
        draw_time TIME NOT NULL,
        cutoff_time TIMESTAMPTZ NOT NULL,
        edit_cutoff_time TIMESTAMPTZ NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'RESULTED', 'SETTLED')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (game_id, draw_date, draw_time)
      );
      CREATE INDEX IF NOT EXISTS idx_draws_game_date ON draws(game_id, draw_date);
    `);

    // 5. Prize Schemes
    await client.query(`
      CREATE TABLE IF NOT EXISTS prize_schemes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        version INT NOT NULL DEFAULT 1,
        unit_rate NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS prize_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        scheme_id UUID NOT NULL REFERENCES prize_schemes(id) ON DELETE CASCADE,
        position VARCHAR(20) NOT NULL,
        mode VARCHAR(10) NOT NULL DEFAULT 'ALL',
        match_count INT NOT NULL DEFAULT 1,
        prize_amount NUMERIC(12, 2) NOT NULL,
        super_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_prize_rules_scheme ON prize_rules(scheme_id);
    `);

    // 6. Number Limits & Counters
    await client.query(`
      CREATE TABLE IF NOT EXISTS number_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
        number VARCHAR(10) NOT NULL,
        max_quantity INT NOT NULL CHECK (max_quantity >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(org_id, draw_id, number)
      );
      CREATE INDEX IF NOT EXISTS idx_number_limits_lookup ON number_limits(org_id, draw_id, number);

      CREATE TABLE IF NOT EXISTS number_limit_counters (
        org_id UUID NOT NULL,
        draw_id UUID NOT NULL,
        number VARCHAR(10) NOT NULL,
        accepted_quantity INT NOT NULL DEFAULT 0,
        PRIMARY KEY (org_id, draw_id, number)
      );
    `);

    // 7. Tickets & Ticket Entries
    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_number VARCHAR(30) NOT NULL UNIQUE,
        org_id UUID NOT NULL REFERENCES organizations(id),
        user_id UUID NOT NULL REFERENCES users(id),
        draw_id UUID NOT NULL REFERENCES draws(id),
        customer_name VARCHAR(100),
        total_quantity INT NOT NULL,
        total_amount NUMERIC(12, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
        idempotency_key VARCHAR(100) UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_draw ON tickets(draw_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_number ON tickets(ticket_number);

      CREATE TABLE IF NOT EXISTS ticket_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        number VARCHAR(10) NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        mode VARCHAR(10) NOT NULL,
        is_box BOOLEAN NOT NULL DEFAULT FALSE,
        unit_price NUMERIC(10, 2) NOT NULL,
        total_price NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_entries_ticket ON ticket_entries(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_entries_number ON ticket_entries(number);
    `);

    // 8. Official Results
    await client.query(`
      CREATE TABLE IF NOT EXISTS official_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
        version INT NOT NULL DEFAULT 1,
        first_prize VARCHAR(10) NOT NULL,
        second_prize VARCHAR(10),
        third_prize VARCHAR(10),
        fourth_prize VARCHAR(10),
        fifth_prize VARCHAR(10),
        sixth_prizes JSONB NOT NULL DEFAULT '[]',
        entered_by UUID NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_results_draw ON official_results(draw_id);
    `);

    // 9. Winning Records
    await client.query(`
      CREATE TABLE IF NOT EXISTS winning_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        result_id UUID NOT NULL REFERENCES official_results(id),
        ticket_id UUID NOT NULL REFERENCES tickets(id),
        entry_id UUID NOT NULL REFERENCES ticket_entries(id),
        user_id UUID NOT NULL REFERENCES users(id),
        org_id UUID NOT NULL REFERENCES organizations(id),
        prize_position VARCHAR(20) NOT NULL,
        prize_amount NUMERIC(12, 2) NOT NULL,
        commission_amount NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_winning_user ON winning_records(user_id);
      CREATE INDEX IF NOT EXISTS idx_winning_ticket ON winning_records(ticket_id);
    `);

    // 10. Financial Ledger
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id),
        user_id UUID NOT NULL REFERENCES users(id),
        draw_id UUID REFERENCES draws(id),
        ticket_id UUID REFERENCES tickets(id),
        entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN (
          'TICKET_SALE',
          'PRIZE_PAYABLE',
          'COMMISSION_PAYABLE',
          'PAYMENT_TO_USER',
          'PAYMENT_FROM_USER',
          'CANCELLATION_REVERSAL',
          'ADJUSTMENT'
        )),
        amount NUMERIC(12, 2) NOT NULL,
        reference_id VARCHAR(100),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_user ON financial_ledger(user_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_org ON financial_ledger(org_id);
    `);

    // 11. Settlements
    await client.query(`
      CREATE TABLE IF NOT EXISTS settlements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id),
        user_id UUID NOT NULL REFERENCES users(id),
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_sales NUMERIC(12, 2) NOT NULL,
        total_prizes NUMERIC(12, 2) NOT NULL,
        total_commission NUMERIC(12, 2) NOT NULL,
        net_balance NUMERIC(12, 2) NOT NULL,
        paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'SETTLED')),
        settled_at TIMESTAMPTZ,
        settled_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_settlements_user ON settlements(user_id);
    `);

    // 12. Audit Logs
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL,
        actor_id UUID,
        action VARCHAR(50) NOT NULL,
        entity VARCHAR(50) NOT NULL,
        entity_id VARCHAR(100),
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
    `);

    // 13. User Custom Ticket Prices (Per User, Per Game, Per Category/Mode)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_ticket_prices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game_id UUID REFERENCES games(id) ON DELETE CASCADE,
        mode VARCHAR(20) NOT NULL,
        price NUMERIC(10, 2) NOT NULL,
        commission NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_game_mode_unique ON user_ticket_prices (
        user_id,
        COALESCE(game_id, '00000000-0000-0000-0000-000000000000'::uuid),
        mode
      );
      CREATE INDEX IF NOT EXISTS idx_user_prices_lookup ON user_ticket_prices(user_id, game_id, mode);
    `);

    // 14. Universal Game Range Limits (Per Game, Digit Types 1, 2, 3, Range Start to End, Max Cap)
    await client.query(`
      CREATE TABLE IF NOT EXISTS game_range_limits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        digit_type INT NOT NULL,
        start_range VARCHAR(10) NOT NULL,
        end_range VARCHAR(10) NOT NULL,
        max_cap INT NOT NULL CHECK (max_cap >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_game_range_limits ON game_range_limits(org_id, game_id, digit_type);
    `);

    await client.query('COMMIT');
    console.log('Database migrations completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run directly if invoked from CLI
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
