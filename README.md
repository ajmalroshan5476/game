# Scalable React Native Number-Game Ticketing & Settlement System

A complete, production-ready, scalable multi-user number-game ticketing, prize management, commission, reporting, and financial settlement platform built with **React Native (Expo + TypeScript)** and a **PostgreSQL + Fastify** backend.

---

## 1. System Architecture

- **Mobile Application**: React Native (Expo SDK 52+, TypeScript) styled with an emerald-green operational design system modeled on the reference screenshots. Uses `lucide-react-native` for vector iconography, `@tanstack/react-query` for request state management, and `react-hook-form` / `zod` for input validation.
- **Backend API**: Fastify + TypeScript with strict input validation, connection pooling (`pg`), parameterized SQL queries, and ACID database transactions.
- **Database**: PostgreSQL with row-level locks (`SELECT ... FOR UPDATE`), atomic capacity accounting, immutable financial ledger entries, and audit logs.
- **Zero External Cache Dependency**: No Redis required. All concurrency safeguards, limits, and financial balances are transactionally enforced in PostgreSQL.

---

## 2. Key Features

### A. Authentication & Account Hierarchy
- **Two Distinct Roles**:
  - `ADMIN`: Manages games, scheduled draws, prize schemes, number limits, user onboarding, official results, and financial settlements.
  - `USER` (Agent): Sells tickets, views reports, checks official results, edits/cancels tickets before cutoffs, and views net settlement.
- **4-Character Alphanumeric Usernames**: Exactly 4 alphanumeric characters (e.g. `0923`, `AD01`) enforced with database uniqueness constraints.
- **Passwords**: Securely hashed with `bcrypt` / `argon2` before storage.

### B. Concurrency-Safe Number-Wise Ticket Limits
- Admin configures maximum quantity limits per number in a draw across the entire assigned-user hierarchy.
- **Deadlock-Free Row-Level Locking**: Sorts requested numbers deterministically before acquiring `SELECT ... FOR UPDATE` locks on counter rows in a single atomic transaction.
- **Atomic Rollback**: If any number in a ticket exceeds the remaining capacity, the entire submission rolls back and returns a structured 409 Conflict with affected number, max capacity, accepted quantity, requested quantity, and remaining capacity.
- **Automated Capacity Release**: Cancelling an eligible ticket before cutoff automatically releases capacity back to the pool.

### C. Financial Settlement & Super Commission
- **Super Commission**: In this application, "Super" designates the agent commission.
- **Settlement Formula**:
  $$\text{Net Balance} = (\text{Total Prizes Payable} + \text{Total Commission Payable}) - \text{Total Sales Liability}$$
  - **Positive Balance**: Admin owes money to the User.
  - **Negative Balance**: User owes money to the Admin.
  - **Zero Balance**: Account is settled.
- **Auditable Financial Ledger**: Records individual transactions (`TICKET_SALE`, `PRIZE_PAYABLE`, `COMMISSION_PAYABLE`, `PAYMENT_TO_USER`, `CANCELLATION_REVERSAL`) with timestamps and references.

### D. Ticket Entry & Range Expansion
- Single number entry (e.g. `717` count `5`).
- Range entry expansion (e.g. `101 to 105` expands into 5 individual numbers `[101, 102, 103, 104, 105]`).
- Bet Modes: `A`, `B`, `C`, `AB`, `AC`, `BC`, `BOX`.
- Live ticket summary: distinct numbers count, total quantity, total collection amount.
- Cutoff time verification against authoritative server time (explicitly supporting exceptions such as `15:03:00` / 3:03 PM).

### E. Comprehensive Reports
1. **Sales Report**: Filter by game, draw, date range, ticket number.
2. **Winnings Report**: Winning numbers, prize position, prize amount, Super commission.
3. **Winning Bill-Wise**: Organized by ticket/bill.
4. **Number-Wise Report**: Aggregate booking volume and sales per number.
5. **Net Pay Report**: Net financial breakdown by game.

---

## 3. Quick Start & Setup

### Prerequisites
- Node.js v20+ or v22+
- PostgreSQL 15+ (running locally or in Docker on port 5432)

### Backend Setup
```bash
cd backend

# 1. Install dependencies
npm install

# 2. Run database migrations
npm run migrate

# 3. Seed initial users, games, draws, schemes, and limits
npm run seed

# 4. Run automated test suite (31 tests covering concurrency & limits)
npm test

# 5. Start backend development server
npm run dev
# Backend runs at http://localhost:4001
```

### Frontend Setup
```bash
cd frontend

# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Start Expo web / mobile development server
npx expo start --web
# Web UI runs at http://localhost:8082
```

---

## 4. Production Admin Credentials

| Role | Username | Password | Purpose |
| :--- | :--- | :--- | :--- |
| **Administrator** | `AJMA` | `559092` | Full access: User Onboarding, Number Limits, Draw Results Publishing, Financial Management. |

> **Note**: In production mode, all test dummy users are cleared. You can create your real agents/users directly from the **Manage Users** screen inside the Admin portal.

---

## 5. Verification & Test Suite

The automated test suite in `backend/src/tests/run_tests.ts` executes 31 end-to-end integration tests:
- Range expansion & boundaries (`101 to 105`).
- Concurrency-safe limit enforcement (User 1 books 60, User 2 books 35 $\rightarrow$ 95 accepted; User 3 attempts 10 $\rightarrow$ rejected with LimitExceededError).
- Capacity release upon ticket cancellation.
- Financial settlement calculation (₹5,000 sales, ₹5,000 prize, ₹400 Super commission $\rightarrow$ Net = +₹400).
- Admin onboarding with 4-character uppercase alphanumeric usernames.
