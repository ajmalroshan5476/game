# SecureApp: Complete System Architecture & Technical Specification

> **Production System Reference Manual**  
> *Number-Game Ticketing, Real-Time Settlement, Concurrency-Safe Limits, and Multi-Tier Agent Management*

---

## 1. High-Level Architecture Overview

SecureApp is built as a cloud-native, high-throughput ticketing and settlement platform designed to run reliably on mobile devices (Android APK) and Web.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (FRONTEND)                         │
│   Expo React Native • Android Standalone APK • Responsive Web UI       │
│                                                                        │
│   ┌────────────────────┐   ┌───────────────────┐   ┌─────────────────┐ │
│   │   Admin Portal     │   │   Agent Portal    │   │ Ticket Terminal │ │
│   │ (VJSH Master Acc)  │   │ (4-Char Agent ID) │   │ (Single / Range)│ │
│   └─────────┬──────────┘   └─────────┬─────────┘   └────────┬────────┘ │
└─────────────┼────────────────────────┼──────────────────────┼──────────┘
              │                        │                      │
              │         HTTPS / JSON REST API with JWT        │
              ▼                        ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION LAYER (RENDER)                     │
│               Node.js 24 • Fastify 5 • TypeScript (ESM)                │
│                 https://game-guqn.onrender.com                         │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │  API Gateway & Middlewares (JWT Auth, CORS, Request Logger)   │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│   ┌───────────────┬───────────────┴───────────────┬────────────────┐   │
│   │ Auth Service  │ Ticket Engine & Limits        │ Results Engine │   │
│   ├───────────────┼───────────────────────────────┼────────────────┤   │
│   │ Report Engine │ Financial Ledger & Settlement │ User Admin     │   │
│   └───────────────┴───────────────┬───────────────┴────────────────┘   │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
                       TCP / TLS IPv4 Connection
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER (SUPABASE CLOUD)                     │
│        Managed PostgreSQL 15 with PgBouncer IPv4 Connection Pooler     │
│                                                                        │
│   • ACID Transactions & Row-Level Locking (`SELECT ... FOR UPDATE`)    │
│   • Concurrency-Safe Number Counters (`number_limit_counters`)         │
│   • Immutable Double-Entry Financial Ledger (`financial_ledger`)       │
│   • Real-Time Winning & Commission Calculation Engine                  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Production Cloud Infrastructure

| Component | Technology | Provider / Host | Details |
| :--- | :--- | :--- | :--- |
| **Backend API** | Fastify 5 + TypeScript | **Render.com** (Web Service) | `https://game-guqn.onrender.com` |
| **Database** | PostgreSQL 15 | **Supabase.com** (Cloud DB) | IPv4 Transaction Pooler (Port 6543) |
| **Mobile App** | React Native (Expo 52) | **Expo EAS Build** | Standalone Android APK (`com.secureapp.game`) |
| **Authentication**| JWT + Bcrypt (10 rounds)| Stateless Bearer Token | Master Admin (`VJSH`) + Agent IDs |

---

## 3. Database Schema (`number_game_db`)

The database consists of 11 relational tables enforcing strict referential integrity, foreign key cascades, and check constraints:

```sql
-- 1. Organizations & Multi-Tenant Boundaries
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users (Admin and Agents)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    username VARCHAR(10) NOT NULL UNIQUE, -- e.g. 'VJSH', '0923', 'AG01'
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'USER')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INACTIVE')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_org ON users(org_id);

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

-- 4. Draws (Specific Scheduled Daily Draws)
CREATE TABLE draws (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    draw_date DATE NOT NULL,
    draw_time TIME NOT NULL, -- e.g. 15:00:00, 18:00:00, 20:00:00
    cutoff_time TIMESTAMPTZ NOT NULL, -- Configured draw cutoff (e.g. 14:45:00)
    edit_cutoff_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'RESULTED', 'SETTLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, draw_date, draw_time)
);

-- 5. Pricing & Prize Schemes
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
    mode VARCHAR(10) NOT NULL DEFAULT 'ALL', -- 'A', 'B', 'C', 'AB', 'AC', 'BC', 'SUPER', 'BOX'
    match_count INT NOT NULL DEFAULT 1,
    prize_amount NUMERIC(12, 2) NOT NULL,
    super_commission NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- 6. Concurrency-Safe Number Limits & Real-Time Counters
CREATE TABLE number_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    draw_id UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    number VARCHAR(10) NOT NULL,
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

-- 7. Tickets & Ticket Line Entries
CREATE TABLE tickets (
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

CREATE TABLE ticket_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    number VARCHAR(10) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    mode VARCHAR(10) NOT NULL, -- 'A', 'B', 'C', 'AB', 'AC', 'BC', 'SUPER', 'BOX'
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
    sixth_prizes JSONB NOT NULL DEFAULT '[]',
    entered_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Winning Records (User Winnings & Super Commission)
CREATE TABLE winning_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_id UUID NOT NULL REFERENCES official_results(id),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    entry_id UUID NOT NULL REFERENCES ticket_entries(id),
    user_id UUID NOT NULL REFERENCES users(id),
    org_id UUID NOT NULL REFERENCES organizations(id),
    prize_position VARCHAR(20) NOT NULL,
    prize_amount NUMERIC(12, 2) NOT NULL,
    commission_amount NUMERIC(12, 2) NOT NULL, -- Super commission
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Financial Ledger (Double-Entry Bookkeeping)
CREATE TABLE financial_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    draw_id UUID REFERENCES draws(id),
    ticket_id UUID REFERENCES tickets(id),
    entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN (
      'TICKET_SALE', 'PRIZE_PAYABLE', 'COMMISSION_PAYABLE',
      'PAYMENT_TO_USER', 'PAYMENT_FROM_USER', 'CANCELLATION_REVERSAL', 'ADJUSTMENT'
    )),
    amount NUMERIC(12, 2) NOT NULL,
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
    net_balance NUMERIC(12, 2) NOT NULL,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIAL', 'SETTLED')),
    settled_at TIMESTAMPTZ,
    settled_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Official Prize & Commission Matrix

The system implements a tiered rate structure depending on the digit category:

### **Group 3 (3 Digits: SUPER & BOX) — Rate ₹10**
| Prize Position | SUPER Prize (₹) | SUPER Super Comm (₹) | BOX Prize (₹) | BOX Super Comm (₹) | Count |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1st Prize** | ₹5,000 | ₹400 | ₹3,000 | ₹300 | 1 |
| **2nd Prize** | ₹500 | ₹50 | ₹800 | ₹30 | 1 |
| **3rd Prize** | ₹250 | ₹20 | ₹800 | ₹30 | 1 |
| **4th Prize** | ₹100 | ₹20 | ₹800 | ₹30 | 1 |
| **5th Prize** | ₹50 | ₹20 | ₹800 | ₹30 | 1 |
| **6th Prize** | ₹20 | ₹10 | ₹800 | ₹30 | 30 |

### **Group 2 (2 Digits: AB, BC, AC) — Rate ₹10**
| Prize Position | Winning Amount (₹) | Super Commission (₹) | Match Type |
| :--- | :--- | :--- | :--- |
| **1st Prize** | ₹700 | ₹30 | AB (1st 2), BC (last 2), AC (1st & 3rd) |

### **Group 1 (1 Digit: A, B, C) — Rate ₹12**
| Prize Position | Winning Amount (₹) | Super Commission (₹) | Match Type |
| :--- | :--- | :--- | :--- |
| **1st Prize** | ₹100 | ₹0 | Position A (1st), B (2nd), C (3rd) |

---

## 5. Draw Lifecycle, Cutoffs & Time Logic

```
   [ DRAW OPENS (12:00 AM) ]
              │
              │  Tickets Accepted (Single / Range)
              ▼
   [ CUTOFF REACHED (e.g. 14:45:00) ]
              │
              ├─► Today's Draw is LOCKED (HTTP 400: Cutoff Passed)
              ├─► Ticket Terminal displays real-time countdown timer
              ├─► Post-cutoff entries allowed ONLY for next day after 12:00 AM
              ▼
   [ DRAW TIME (15:00:00) ]
              │
              ├─► Admin inputs official winning numbers
              ├─► Automated Winning Evaluation Triggered
              ├─► Winning Records & Super Commissions Created
              ├─► Real-Time Reports Updated
              ▼
   [ RESULTED & SETTLED ]
```

---

## 6. Concurrency-Safe Number Limiting Algorithm

To prevent race conditions during high-volume last-minute ticket submission bursts:

1. **Deadlock-Free Sorting**: Distinct numbers in the payload are sorted in ascending order before acquiring locks.
2. **Deterministic Row Locking**:
   ```sql
   BEGIN;
   -- Check cutoff timestamp
   SELECT cutoff_time FROM draws WHERE id = $1 FOR SHARE;

   -- Upsert initial counters
   INSERT INTO number_limit_counters (org_id, draw_id, number, accepted_quantity)
   VALUES ($orgId, $drawId, $num, 0)
   ON CONFLICT (org_id, draw_id, number) DO NOTHING;

   -- Acquire exclusive row locks in sorted order
   SELECT number, accepted_quantity
   FROM number_limit_counters
   WHERE org_id = $orgId AND draw_id = $drawId AND number = ANY($sortedNumbers)
   FOR UPDATE;

   -- Verify against limits
   -- If (accepted_quantity + requested_quantity > max_quantity) -> ROLLBACK & RETURN 409

   -- Increment counters & insert ticket
   UPDATE number_limit_counters
   SET accepted_quantity = accepted_quantity + $qty
   WHERE org_id = $orgId AND draw_id = $drawId AND number = $num;

   COMMIT;
   ```

---

## 7. Financial Balance Formula

```
Net Settlement Balance = (Total Winning Prizes + Total Super Commission) - Total Sales Liability
```

* **Positive (+₹):** The Admin owes money to the Agent.
* **Negative (-₹):** The Agent owes money to the Admin.

---

## 8. Frontend & Backend Codebase Structure

```
game-vijesh/
├── ARCHITECTURE.md                  # This complete architecture document
├── backend/                         # Node.js Fastify Backend
│   ├── src/
│   │   ├── db/
│   │   │   ├── migrate.ts           # Automatic PostgreSQL schema migrations
│   │   │   ├── seed.ts              # Seeds games and official 18 prize rules
│   │   │   ├── pool.ts              # Pg pool with SSL for cloud Supabase
│   │   │   ├── create_user.ts       # CLI / programmatic user provisioning
│   │   │   └── reset.ts             # Complete database wipe and reset
│   │   ├── routes/
│   │   │   └── api.routes.ts        # All REST endpoints (Auth, Tickets, Reports, etc.)
│   │   ├── services/
│   │   │   ├── auth.service.ts      # Authentication & JWT issuance
│   │   │   ├── ticket.service.ts    # Single & range expansion + rate computation
│   │   │   ├── limit.service.ts     # Number limits and row-level locks
│   │   │   ├── result.service.ts    # Draw winners & super commission evaluation
│   │   │   ├── report.service.ts    # Sales, winning, bill-wise real-time reports
│   │   │   └── finance.service.ts   # Double-entry ledger and settlements
│   │   └── server.ts                # Fastify boot, CORS, auto-migrate & auto-seed
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/                        # Expo React Native App
    ├── app.json                     # App configuration (name: SecureApp, package: com.secureapp.game)
    ├── eas.json                     # EAS Build configuration for direct Android APK export
    ├── src/
    │   ├── api/
    │   │   └── client.ts            # Typed HTTP client pointing to Render backend
    │   ├── context/
    │   │   └── AuthContext.tsx      # Auth state and token persistence via AsyncStorage
    │   ├── screens/
    │   │   ├── LoginScreen.tsx      # Secure Sign In screen
    │   │   ├── HomeScreen.tsx       # Main dashboard with Admin & Agent operational cards
    │   │   ├── TicketEntryScreen.tsx# Single & Range ticketing (SUPER, BOX, BOTH) + Countdown
    │   │   ├── SchemeScreen.tsx     # Reference scheme screen matching exact prize tables
    │   │   ├── ManageUsersScreen.tsx# Admin user management (+ New Agent, Suspend, Reset Pass)
    │   │   ├── ManageSalesScreen.tsx# Real-time sales monitor & live liability
    │   │   ├── ReportsScreen.tsx    # Filterable Sales, Winning, and Bill-wise reports
    │   │   ├── ResultsScreen.tsx    # Official result publishing & winner verification
    │   │   └── NumberLimitsScreen.tsx# Number capacity & cap controls
    │   └── theme/
    │       └── colors.ts            # Emerald-accented operational design system
    ├── package.json
    └── tsconfig.json
```
