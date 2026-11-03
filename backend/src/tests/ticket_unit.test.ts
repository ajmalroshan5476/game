import { TicketService, normalizeModeForNumber, LimitExceededError } from '../services/ticket.service.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error('FAIL: ' + msg);
    process.exit(1);
  }
  console.log('✓ ' + msg);
}

console.log('Running Ticket Unit Tests...');

// 1. normalizeModeForNumber
{
  const r1 = normalizeModeForNumber('5', 'B');
  assert(r1.mode === 'B' && r1.isBox === false, 'Single digit with mode B normalized');

  const r2 = normalizeModeForNumber('5', 'INVALID');
  assert(r2.mode === 'A' && r2.isBox === false, 'Single digit with invalid mode defaults to A');

  const r3 = normalizeModeForNumber('42', 'BC');
  assert(r3.mode === 'BC' && r3.isBox === false, 'Two digit with mode BC normalized');

  const r4 = normalizeModeForNumber('42', 'INVALID');
  assert(r4.mode === 'AB' && r4.isBox === false, 'Two digit with invalid mode defaults to AB');

  const r5 = normalizeModeForNumber('123', 'BOX');
  assert(r5.mode === 'BOX' && r5.isBox === true, 'Three digit with mode BOX normalized');

  const r6 = normalizeModeForNumber('123', 'SUPER');
  assert(r6.mode === 'SUPER' && r6.isBox === false, 'Three digit with mode SUPER normalized');
}

// 2. expandEntries with single entries
{
  const entries = TicketService.expandEntries(
    [
      { number: '123', quantity: 5, mode: 'SUPER' },
      { number: '456', quantity: 2, mode: 'BOX' },
      { number: '7', quantity: 10, mode: 'A' },
      { number: '89', quantity: 4, mode: 'AB' },
    ],
    10.0
  );

  assert(entries.length === 4, 'Expands 4 entries correctly');
  assert(entries[0].number === '123' && entries[0].mode === 'SUPER' && entries[0].totalPrice === 50, 'SUPER entry total price 5 * 10 = 50');
  assert(entries[1].number === '456' && entries[1].mode === 'BOX' && entries[1].isBox === true && entries[1].totalPrice === 20, 'BOX entry total price 2 * 10 = 20');
  assert(entries[2].number === '7' && entries[2].mode === 'A' && entries[2].totalPrice === 120, 'A entry total price 10 * 12 = 120 (single digit default rate 12)');
  assert(entries[3].number === '89' && entries[3].mode === 'AB' && entries[3].totalPrice === 40, 'AB entry total price 4 * 10 = 40');
}

// 3. expandEntries with user custom pricing
{
  const customMap = new Map<string, number>([
    ['SUPER', 9.5],
    ['BOX', 8.0],
    ['A', 11.0],
  ]);

  const entries = TicketService.expandEntries(
    [
      { number: '123', quantity: 10, mode: 'SUPER' },
      { number: '456', quantity: 5, mode: 'BOX' },
      { number: '1', quantity: 2, mode: 'A' },
    ],
    10.0,
    customMap
  );

  assert(entries[0].totalPrice === 95, 'SUPER uses custom rate 9.5: 10 * 9.5 = 95');
  assert(entries[1].totalPrice === 40, 'BOX uses custom rate 8.0: 5 * 8 = 40');
  assert(entries[2].totalPrice === 22, 'A uses custom rate 11.0: 2 * 11 = 22');
}

// 4. expandEntries with range
{
  const entries = TicketService.expandEntries(
    [
      { startRange: '100', endRange: '104', quantity: 2, mode: 'SUPER' },
    ],
    10.0
  );
  assert(entries.length === 5, 'Range 100-104 expands to 5 numbers');
  assert(entries[0].number === '100' && entries[4].number === '104', 'Range boundaries correct');
}

// 5. Validation errors
{
  let failedQty = false;
  try {
    TicketService.expandEntries([{ number: '123', quantity: 0 }], 10.0);
  } catch {
    failedQty = true;
  }
  assert(failedQty, 'Rejects quantity <= 0');

  let failedRange = false;
  try {
    TicketService.expandEntries([{ startRange: '200', endRange: '100', quantity: 1 }], 10.0);
  } catch {
    failedRange = true;
  }
  assert(failedRange, 'Rejects inverted range start > end');
}

// 6. LimitExceededError
{
  const err = new LimitExceededError({
    number: '777',
    maxQuantity: 50,
    currentlyAccepted: 45,
    requested: 10,
    remaining: 5,
  });
  assert(err.name === 'LimitExceededError', 'LimitExceededError has correct name');
  assert(err.number === '777' && err.remaining === 5, 'LimitExceededError has proper data fields');
}

// 7. Net Pay Calculation and Daily Aggregation Logic
{
  const mockGames = [
    { gameName: 'DEAR 1PM', totalSales: 500, totalPrizes: 200, totalCommission: 50 },
    { gameName: 'DEAR 6PM', totalSales: 800, totalPrizes: 900, totalCommission: 80 },
    { gameName: 'DEAR 8PM', totalSales: 300, totalPrizes: 0, totalCommission: 30 },
  ];

  const items = mockGames.map((g) => {
    const netPay = g.totalPrizes + g.totalCommission - g.totalSales;
    return {
      ...g,
      netPay,
    };
  });

  assert(items[0].netPay === -250, 'DEAR 1PM Net Pay: 200 + 50 - 500 = -250 (Payable)');
  assert(items[1].netPay === 180, 'DEAR 6PM Net Pay: 900 + 80 - 800 = +180 (Receivable)');
  assert(items[2].netPay === -270, 'DEAR 8PM Net Pay: 0 + 30 - 300 = -270 (Payable)');

  // Daily summary aggregating all games for individual user
  const summary = items.reduce(
    (acc, item) => {
      acc.totalSales += item.totalSales;
      acc.totalPrizes += item.totalPrizes;
      acc.totalCommission += item.totalCommission;
      acc.netPay += item.netPay;
      return acc;
    },
    { gameName: 'TOTAL / ALL GAMES', totalSales: 0, totalPrizes: 0, totalCommission: 0, netPay: 0 }
  );

  assert(summary.totalSales === 1600, 'Consolidated Day Sales: 500 + 800 + 300 = 1600');
  assert(summary.totalPrizes === 1100, 'Consolidated Day Prizes: 200 + 900 + 0 = 1100');
  assert(summary.totalCommission === 160, 'Consolidated Day Commission: 50 + 80 + 30 = 160');
  assert(summary.netPay === -340, 'Consolidated Day Net Pay: 1100 + 160 - 1600 = -340 (Payable)');
}

console.log('All ticket unit tests PASSED successfully!');

