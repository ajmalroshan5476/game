# Scalable React Native Number-Game Ticketing & Settlement System
## Architecture & Technical Specification

### 1. System Overview
A multi-user number-game ticketing, prize management, commission, reporting, and financial settlement platform built with:
- **Backend**: Fastify + TypeScript with strict input validation (Zod), PostgreSQL connection pooling (`pg`), parameterized queries, and ACID transaction boundaries.
- **Database**: PostgreSQL 15 running locally (`number_game_db`) with row-level locks (`SELECT ... FOR UPDATE`), atomic number limit counters, immutable financial ledger entries, and audit logs.
- **Frontend**: React Native with Expo (SDK 52+), Expo Router / TypeScript, `lucide-react-native`, TanStack Query, React Hook Form, and responsive mobile-first UI replicating the Emerald-accented operational design system from the reference screenshots.

---

### 2. Database Schema Design (`number_game_db`)

```sql
-- 1. Organizations & Admins
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users (Admin and Agent/User)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username VARCHAR(10) NOT NULL UNIQUE, -- 4-character uppercase alphanumeric (e.g. 923A, U101, 0923)
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Games (e.g. LSK 3 PM, DEAR 1 PM, DEAR 6 PM, DEAR 8 PM)
CREATE TABLE games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    color VARCHAR(20) NOT NULL DEFAULT '#00A859',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Draws (Specific scheduled instances)
CREATE TABLE draws (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    draw_date DATE NOT NULL,
    draw_time TIME NOT NULL, -- e.g. 15:00:00, 18:00:00
    cutoff_time TIMESTAMPTZ NOT NULL, -- Configurable cutoff (supports 15:03:00 etc.)
    edit_cutoff_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'RESULTED', 'SETTLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, draw_date, draw_time)
);

-- 5. Pricing and Prize Schemes
CREATE TABLE prize_schemes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    unit_rate NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE prize_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheme_id UUID NOT NULL REFERENCES prize_schemes(id) ON DELETE CASCADE,
    position VARCHAR(20) NOT NULL, -- 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'
    mode VARCHAR(10) NOT NULL DEFAULT 'ALL', -- 'A', 'B', 'C', 'AB', 'AC', 'BC', 'BOX', 'ALL'
    match_count INT NOT NULL DEFAULT 1, -- e.g. 30 for 6th prize
    prize_amount NUMERIC(12, 2) NOT NULL,
    super_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00 -- Super = Agent Commission
);

-- 6. Concurrency-Safe Number Limits & Counters
CREATE TABLE number_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    number VARCHAR(10) NOT NULL, -- Normalized string e.g. "717", "05"
    max_quantity INT NOT NULL CHECK (max_quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, draw_id, number)
);

CREATE TABLE number_limit_counters (
    org_id UUID NOT NULL,
    draw_id UUID NOT NULL,
    number VARCHAR(10) NOT NULL,
    accepted_quantity INT NOT NULL DEFAULT 0,
    PRIMARY KEY (org_id, draw_id, number)
);

-- 7. Tickets & Ticket Entries
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number VARCHAR(30) NOT NULL UNIQUE, -- e.g. TKT-20261025-XXXX
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

CREATE TABLE ticket_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    number VARCHAR(10) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    mode VARCHAR(10) NOT NULL, -- 'A', 'B', 'C', 'AB', 'AC', 'BC', 'BOX'
    is_box BOOLEAN NOT NULL DEFAULT FALSE,
    unit_price NUMERIC(10, 2) NOT NULL,
    total_price NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Official Results
CREATE TABLE official_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    first_prize VARCHAR(10) NOT NULL,
    second_prize VARCHAR(10),
    third_prize VARCHAR(10),
    fourth_prize VARCHAR(10),
    fifth_prize VARCHAR(10),
    sixth_prizes JSONB NOT NULL DEFAULT '[]', -- Array of numbers
    entered_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Winning Records
CREATE TABLE winning_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES official_results(id),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    entry_id UUID NOT NULL REFERENCES ticket_entries(id),
    user_id UUID NOT NULL REFERENCES users(id),
    org_id UUID NOT NULL REFERENCES organizations(id),
    prize_position VARCHAR(20) NOT NULL,
    prize_amount NUMERIC(12, 2) NOT NULL,
    commission_amount NUMERIC(12, 2) NOT NULL, -- Super
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Financial Ledger
CREATE TABLE financial_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    draw_id UUID REFERENCES draws(id),
    ticket_id UUID REFERENCES tickets(id),
    entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('TICKET_SALE', 'PRIZE_PAYABLE', 'COMMISSION_PAYABLE', 'PAYMENT_TO_USER', 'PAYMENT_FROM_USER', 'CANCELLATION_REVERSAL', 'ADJUSTMENT')),
    amount NUMERIC(12, 2) NOT NULL, -- positive or negative
    reference_id VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Settlements
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_sales NUMERIC(12, 2) NOT NULL,
    total_prizes NUMERIC(12, 2) NOT NULL,
    total_commission NUMERIC(12, 2) NOT NULL,
    net_balance NUMERIC(12, 2) NOT NULL, -- total_prizes + total_commission - total_sales
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'SETTLED')),
    settled_at TIMESTAMPTZ,
    settled_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 3. Concurrency-Safe Number-Limit Algorithm

1. **Ordering to Prevent Deadlocks**: Sort distinct numbers alphabetically before acquiring row locks:
   ```ts
   const distinctNumbers = Array.from(requestedMap.keys()).sort();
   ```
2. **Locking & Validation inside Single Transaction**:
   ```sql
   BEGIN;
   -- 1. Check cutoff
   SELECT cutoff_time FROM draws WHERE id = $1 FOR SHARE;
   -- If NOW() >= cutoff_time -> ROLLBACK & REJECT

   -- 2. Lock counter rows in deterministic order
   -- If row does not exist, insert initial 0 with ON CONFLICT DO NOTHING
   INSERT INTO number_limit_counters (org_id, draw_id, number, accepted_quantity)
   VALUES ($orgId, $drawId, $num, 0)
   ON CONFLICT (org_id, draw_id, number) DO NOTHING;

   SELECT number, accepted_quantity
   FROM number_limit_counters
   WHERE org_id = $orgId AND draw_id = $drawId AND number = ANY($distinctNumbers)
   FOR UPDATE;

   -- 3. Check against max limits
   SELECT number, max_quantity
   FROM number_limits
   WHERE org_id = $orgId AND draw_id = $drawId AND number = ANY($distinctNumbers);

   -- For each number:
   -- if (accepted + requested > max) {
   --   ROLLBACK;
   --   return HTTP 409 {
   --     error: "NUMBER_LIMIT_EXCEEDED",
   --     number, maxQuantity, currentlyAccepted, requested, remaining
   --   }
   -- }

   -- 4. Increment counters
   UPDATE number_limit_counters
   SET accepted_quantity = accepted_quantity + $qty
   WHERE org_id = $orgId AND draw_id = $drawId AND number = $num;

   -- 5. Insert ticket & entries & sales liability ledger entry
   COMMIT;
   ```

---

### 4. Financial Calculations & Verification

**Formula**:
`Net Balance = Total Prizes Payable + Total Commission Payable - Total Sales Liability`

**Verified User Example**:
- Sales Liability = ₹5,000
- Winning Prize = ₹5,000
- Super Commission = ₹400
- Net = (₹5,000 + ₹400) - ₹5,000 = **+₹400** (Positive = Admin pays User ₹400).
