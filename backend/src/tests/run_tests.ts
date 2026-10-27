import { pool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed.js';
import { AuthService } from '../services/auth.service.js';
import { TicketService, LimitExceededError } from '../services/ticket.service.js';
import { LimitService } from '../services/limit.service.js';
import { ResultService } from '../services/result.service.js';
import { FinanceService } from '../services/finance.service.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${testName}`);
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runTestSuite() {
  console.log('\n========================================');
  console.log('STARTING AUTOMATED TEST SUITE');
  console.log('========================================\n');

  // Initialize DB
  await runMigrations();
  await runSeed();

  const orgRes = await pool.query(`SELECT id FROM organizations LIMIT 1`);
  const orgId = orgRes.rows[0].id;

  const adminRes = await pool.query(`SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`);
  const adminId = adminRes.rows[0].id;

  // Create temporary test users if not present
  let user1Res = await pool.query(`SELECT id FROM users WHERE username = '0923'`);
  let user1Id: string;
  if (user1Res.rows.length === 0) {
    const u1 = await AuthService.createUser(orgId, adminId, '0923', 'user123');
    user1Id = u1.id;
  } else {
    user1Id = user1Res.rows[0].id;
  }

  let user2Res = await pool.query(`SELECT id FROM users WHERE username = '0924'`);
  let user2Id: string;
  if (user2Res.rows.length === 0) {
    const u2 = await AuthService.createUser(orgId, adminId, '0924', 'user123');
    user2Id = u2.id;
  } else {
    user2Id = user2Res.rows[0].id;
  }

  // Find or create test draw
  const drawRes = await pool.query(
    `SELECT d.id, g.name AS game_name FROM draws d
     JOIN games g ON g.id = d.game_id
     WHERE g.org_id = $1 AND g.code = 'LSK_3PM'
     ORDER BY d.created_at DESC LIMIT 1`,
    [orgId]
  );
  let testDrawId = drawRes.rows[0].id;

  // Make sure draw cutoff is in the future for tests
  await pool.query(
    `UPDATE draws SET cutoff_time = NOW() + INTERVAL '2 hours',
                      edit_cutoff_time = NOW() + INTERVAL '1 hour',
                      status = 'OPEN'
     WHERE id = $1`,
    [testDrawId]
  );

  // --------------------------------------------------------------------------
  console.log('--- 1. TICKET ENTRY & RANGE EXPANSION TESTS ---');
  // --------------------------------------------------------------------------
  {
    // Test: Range expansion 101 to 105
    const expanded = TicketService.expandEntries(
      [
        {
          startRange: '101',
          endRange: '105',
          quantity: 2,
          mode: 'A',
        },
      ],
      10.0
    );
    assert(expanded.length === 5, 'Range 101-105 expands into 5 individual numbers');
    assert(expanded[0].number === '101' && expanded[4].number === '105', 'Range boundaries are correct');
    assert(expanded[0].totalPrice === 20.0, 'Each entry total price is quantity * unitRate (2 * 10 = 20)');

    // Test: Submit single valid ticket
    const testIdempKey = 'test-idemp-' + Date.now();
    const ticket1 = await TicketService.submitTicket(orgId, user1Id, {
      drawId: testDrawId,
      customerName: 'Suresh Kumar',
      entries: [
        { number: '345', quantity: 3, mode: 'A' },
      ],
      idempotencyKey: testIdempKey,
    });
    assert(ticket1.ticket_number.endsWith('-TKT'), 'Generates unique ticket number with -TKT suffix');
    assert(parseInt(ticket1.total_quantity, 10) === 3, 'Total quantity is 3');
    assert(parseFloat(ticket1.total_amount) === 30.0, 'Total amount is 30.0');

    // Test: Idempotency retry returns identical ticket
    const ticket1Retry = await TicketService.submitTicket(orgId, user1Id, {
      drawId: testDrawId,
      customerName: 'Suresh Kumar',
      entries: [{ number: '345', quantity: 3, mode: 'A' }],
      idempotencyKey: testIdempKey,
    });
    assert(ticket1Retry.id === ticket1.id, 'Idempotent resubmission returns same ticket ID');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- 2. CONCURRENCY-SAFE NUMBER LIMIT TESTS ---');
  // --------------------------------------------------------------------------
  {
    // Configure number 717 with maximum limit of 100 for testDrawId
    await LimitService.setLimit(orgId, testDrawId, '717', 100);

    // Reset counter to 0 for a clean test
    await pool.query(
      `UPDATE number_limit_counters SET accepted_quantity = 0 WHERE org_id = $1 AND draw_id = $2 AND number = '717'`,
      [orgId, testDrawId]
    );

    // User 1 submits 60 units of 717
    const sub1 = await TicketService.submitTicket(orgId, user1Id, {
      drawId: testDrawId,
      entries: [{ number: '717', quantity: 60, mode: 'A' }],
    });
    assert(sub1.id !== undefined, 'User 1 successfully submits 60 units of 717');

    // User 2 submits 35 units of 717
    const sub2 = await TicketService.submitTicket(orgId, user2Id, {
      drawId: testDrawId,
      entries: [{ number: '717', quantity: 35, mode: 'A' }],
    });
    assert(sub2.id !== undefined, 'User 2 successfully submits 35 units of 717');

    // Check counter: 60 + 35 = 95
    const limits = await LimitService.getLimitsForDraw(orgId, testDrawId);
    const limit717 = limits.find((l) => l.number === '717');
    assert(limit717?.accepted_quantity === 95, 'Combined accepted quantity across users is 95');
    assert(limit717?.remaining_quantity === 5, 'Remaining available capacity is 5');

    // User 1 attempts 10 units of 717 -> 95 + 10 = 105 > 100 -> MUST REJECT!
    let rejected = false;
    try {
      await TicketService.submitTicket(orgId, user1Id, {
        drawId: testDrawId,
        entries: [{ number: '717', quantity: 10, mode: 'A' }],
      });
    } catch (err: any) {
      if (err instanceof LimitExceededError) {
        rejected = true;
        assert(err.number === '717', 'Rejection specifies affected number 717');
        assert(err.maxQuantity === 100, 'Rejection specifies max quantity 100');
        assert(err.currentlyAccepted === 95, 'Rejection specifies currently accepted 95');
        assert(err.requested === 10, 'Rejection specifies requested 10');
        assert(err.remaining === 5, 'Rejection specifies remaining capacity 5');
      }
    }
    assert(rejected, 'Submission exceeding limit is atomically rejected with LimitExceededError');

    // Verify counter is still 95 after rollback
    const counterCheck = await pool.query(
      `SELECT accepted_quantity FROM number_limit_counters WHERE org_id = $1 AND draw_id = $2 AND number = '717'`,
      [orgId, testDrawId]
    );
    assert(
      parseInt(counterCheck.rows[0].accepted_quantity, 10) === 95,
      'Database counter remains exactly 95 after rollback'
    );

    // Test: Cancel User 2's ticket (35 units) and verify capacity is released
    await TicketService.cancelTicket(orgId, user2Id, sub2.ticket_number);
    const counterAfterCancel = await pool.query(
      `SELECT accepted_quantity FROM number_limit_counters WHERE org_id = $1 AND draw_id = $2 AND number = '717'`,
      [orgId, testDrawId]
    );
    assert(
      parseInt(counterAfterCancel.rows[0].accepted_quantity, 10) === 60,
      'Capacity released from 95 to 60 upon ticket cancellation'
    );
  }

  // --------------------------------------------------------------------------
  console.log('\n--- 3. FINANCIAL SETTLEMENT & COMMISSION TESTS ---');
  // --------------------------------------------------------------------------
  {
    // Requirement from Prompt:
    // User sells ₹5,000 worth of tickets.
    // Winning ticket earns ₹5,000 prize and ₹400 commission.
    // User owes: ₹5,000 sales
    // Entitled to: ₹5,000 prize + ₹400 commission = ₹5,400 payout from admin
    // Net settlement = ₹5,400 - ₹5,000 = +₹400 (Admin owes user ₹400).

    // Create a dedicated clean user for financial test
    const randomFinUsername = `F${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const finUser = await AuthService.createUser(orgId, adminId, randomFinUsername, 'password123');

    // Create dedicated draw
    const uniqueSec = Math.floor(Math.random() * 59);
    const uniqueMin = Math.floor(Math.random() * 59);
    const uniqueHour = 19 + Math.floor(Math.random() * 4);
    const finDrawRes = await pool.query(
      `INSERT INTO draws (game_id, draw_date, draw_time, cutoff_time, edit_cutoff_time, status)
       VALUES (
         (SELECT id FROM games WHERE code = 'DEAR_6PM' LIMIT 1),
         CURRENT_DATE + INTERVAL '10 days',
         '${uniqueHour}:${uniqueMin < 10 ? '0' : ''}${uniqueMin}:${uniqueSec < 10 ? '0' : ''}${uniqueSec}',
         NOW() + INTERVAL '20 days',
         NOW() + INTERVAL '19 days',
         'OPEN'
       ) RETURNING id`
    );
    const finDrawId = finDrawRes.rows[0].id;

    // Sell 500 units at ₹10 = ₹5,000 sales
    const winTicket = await TicketService.submitTicket(orgId, finUser.id, {
      drawId: finDrawId,
      customerName: 'Fin Test Customer',
      entries: [
        { number: '999', quantity: 1, mode: 'A' }, // Winning number (1st prize = 5000, commission = 400)
        { number: '888', quantity: 499, mode: 'A' }, // Other tickets = 499 * 10 = 4990
      ],
    });

    assert(parseFloat(winTicket.total_amount) === 5000.0, 'Total ticket sales liability is exactly ₹5,000');

    // Admin publishes official results: 1st prize is 999
    const pubRes = await ResultService.publishResult(orgId, adminId, {
      drawId: finDrawId,
      firstPrize: '999',
    });

    assert(pubRes.totalPrizePayout === 5000.0, 'Total prize payout awarded is ₹5,000');
    assert(pubRes.totalCommissionPayout === 400.0, 'Total Super commission awarded is ₹400');

    // Calculate settlement summary
    const settlements = await FinanceService.getSettlementSummary(orgId, finUser.id);
    const finSummary = settlements.find((s) => s.userId === finUser.id);

    assert(finSummary !== undefined, 'Found settlement summary for test user');
    assert(finSummary?.totalSales === 5000.0, 'Total sales liability is ₹5,000');
    assert(finSummary?.totalPrizes === 5000.0, 'Total prizes payable is ₹5,000');
    assert(finSummary?.totalCommission === 400.0, 'Total commission payable is ₹400');
    assert(
      finSummary?.netBalance === 400.0,
      'Net settlement is exactly +₹400 (Admin owes user ₹400)'
    );

    // Admin records payment of ₹400 to the user
    await FinanceService.recordPayment(orgId, adminId, finUser.id, 400.0, 'TO_USER', 'Settlement cleared');
    const updatedSettlement = await FinanceService.getSettlementSummary(orgId, finUser.id);
    const settledFin = updatedSettlement.find((s) => s.userId === finUser.id);
    assert(settledFin?.outstandingBalance === 0.0, 'Outstanding balance is ₹0.00 after recording payment');
  }

  // --------------------------------------------------------------------------
  console.log('\n--- 4. USER ONBOARDING & 4-CHAR USERNAME VALIDATION ---');
  // --------------------------------------------------------------------------
  {
    // Valid 4-character username
    const testUsername = `A${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const validUser = await AuthService.createUser(orgId, adminId, testUsername, 'strongpass123');
    assert(validUser.username === testUsername, `Successfully created user with 4-char username ${testUsername}`);

    // Invalid length (>4 or <4) must fail
    let failedLength = false;
    try {
      await AuthService.createUser(orgId, adminId, 'TOOLONG', 'strongpass123');
    } catch {
      failedLength = true;
    }
    assert(failedLength, 'Rejects username exceeding 4 characters');

    // Duplicate username must fail
    let failedDup = false;
    try {
      await AuthService.createUser(orgId, adminId, testUsername, 'strongpass123');
    } catch {
      failedDup = true;
    }
    assert(failedDup, `Rejects duplicate username ${testUsername}`);

    // Clean up all non-admin test users, tickets, entries, and ledger created during test suite
    await pool.query('DELETE FROM winning_records');
    await pool.query('DELETE FROM financial_ledger');
    await pool.query('DELETE FROM ticket_entries');
    await pool.query('DELETE FROM tickets');
    await pool.query('DELETE FROM number_limit_counters');
    await pool.query('DELETE FROM official_results');
    await pool.query("DELETE FROM draws WHERE draw_time NOT IN ('13:00:00', '15:00:00', '18:00:00', '20:00:00')");
    await pool.query("DELETE FROM users WHERE role != 'ADMIN'");
    await pool.query("UPDATE draws SET status = 'OPEN'");

    // Restore exact authoritative cutoff times for standard draws
    await pool.query("UPDATE draws SET cutoff_time = (draw_date || ' 12:58:00+05:30')::timestamptz, edit_cutoff_time = (draw_date || ' 12:55:00+05:30')::timestamptz WHERE draw_time = '13:00:00'");
    await pool.query("UPDATE draws SET cutoff_time = (draw_date || ' 15:03:00+05:30')::timestamptz, edit_cutoff_time = (draw_date || ' 15:00:00+05:30')::timestamptz WHERE draw_time = '15:00:00'");
    await pool.query("UPDATE draws SET cutoff_time = (draw_date || ' 17:58:00+05:30')::timestamptz, edit_cutoff_time = (draw_date || ' 17:55:00+05:30')::timestamptz WHERE draw_time = '18:00:00'");
    await pool.query("UPDATE draws SET cutoff_time = (draw_date || ' 19:58:00+05:30')::timestamptz, edit_cutoff_time = (draw_date || ' 19:55:00+05:30')::timestamptz WHERE draw_time = '20:00:00'");
  }

  console.log('\n========================================');
  console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests})`);
  console.log('========================================\n');
}

runTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
