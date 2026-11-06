import { TicketService, normalizeModeForNumber, LimitExceededError } from '../services/ticket.service.js';
import { evaluateBoxWin } from '../services/result.service.js';

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

// 8. Clipboard Ticket Data Parsing Logic
{
  function parseClipboardTicketData(text: string) {
    if (!text || typeof text !== 'string') return [];
    const results: Array<{ number: string; count: number; boxCount?: number; digitGroup: '1' | '2' | '3' }> = [];
    const lines = text.split(/[\r\n]+/);

    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;

      const line = rawLine
        // Strip WhatsApp bracket metadata e.g. [10:36 PM, 11/4/2026] Name:
        .replace(/^\[.*?\]\s*(?:[^:\r\n]+:)?\s*/, '')
        // Strip WhatsApp dash metadata e.g. 11/4/2026, 10:36 PM - Name:
        .replace(/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*-\s*(?:[^:\r\n]+:)?\s*/gi, '')
        // Strip trailing or standalone timestamps like 10:36 PM or 10:36 or 10:36:00 AM
        .replace(/\s*\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b\s*/gi, ' ')
        // Strip dates like 11/4/2026 or 11-04-2026
        .replace(/\s*\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b\s*/g, ' ')
        .trim();

      if (!line) continue;

      // Pattern 1: match 3-part or 2-part patterns with delimiter (-, :, /, or ,)
      const regex = /\b(\d{1,3})\s*[-:=/,]\s*(\d+)(?:\s*[-:=/,]\s*(\d+))?\b/g;
      let match;
      let found = false;
      while ((match = regex.exec(line)) !== null) {
        found = true;
        const num = match[1];
        const count = parseInt(match[2], 10);
        const box = match[3] ? parseInt(match[3], 10) : undefined;
        const dGroup: '1' | '2' | '3' = num.length === 1 ? '1' : num.length === 2 ? '2' : '3';
        results.push({
          number: num,
          count: isNaN(count) || count <= 0 ? 1 : count,
          boxCount: box !== undefined && !isNaN(box) && box > 0 ? box : undefined,
          digitGroup: dGroup,
        });
      }

      if (!found) {
        const spaceMatch = line.match(/\b(\d{1,3})\s+(\d+)(?:\s+(\d+))?\b/);
        if (spaceMatch) {
          const num = spaceMatch[1];
          const count = parseInt(spaceMatch[2], 10);
          const box = spaceMatch[3] ? parseInt(spaceMatch[3], 10) : undefined;
          const dGroup: '1' | '2' | '3' = num.length === 1 ? '1' : num.length === 2 ? '2' : '3';
          results.push({
            number: num,
            count: isNaN(count) || count <= 0 ? 1 : count,
            boxCount: box !== undefined && !isNaN(box) && box > 0 ? box : undefined,
            digitGroup: dGroup,
          });
        }
      }
    }
    return results;
  }

  // Test 1: 551-5-5
  const r1 = parseClipboardTicketData('551-5-5');
  assert(r1.length === 1, '551-5-5 parsed 1 item');
  assert(r1[0].number === '551' && r1[0].count === 5 && r1[0].boxCount === 5 && r1[0].digitGroup === '3', '551-5-5 has number 551, count 5, box 5, digitGroup 3');

  // Test 2: 551-2
  const r2 = parseClipboardTicketData('551-2');
  assert(r2.length === 1, '551-2 parsed 1 item');
  assert(r2[0].number === '551' && r2[0].count === 2 && r2[0].boxCount === undefined && r2[0].digitGroup === '3', '551-2 has number 551, count 2, no box, digitGroup 3');

  // Test 3: 24-2
  const r3 = parseClipboardTicketData('24-2');
  assert(r3.length === 1, '24-2 parsed 1 item');
  assert(r3[0].number === '24' && r3[0].count === 2 && r3[0].digitGroup === '2', '24-2 has number 24, count 2, digitGroup 2');

  // Test 4: Multiline text
  const multiText = `
    Hi bro
    551-5-5
    551-2
    24-2
    Thank you
  `;
  const r4 = parseClipboardTicketData(multiText);
  assert(r4.length === 3, 'Multiline text parsed 3 ticket items');
  assert(r4[0].number === '551' && r4[0].boxCount === 5, 'Item 1 is 551 with box 5');
  assert(r4[1].number === '551' && r4[1].count === 2, 'Item 2 is 551 with super 2');
  assert(r4[2].number === '24' && r4[2].count === 2, 'Item 3 is 24 with qty 2');

  // Test 5: Exact WhatsApp screenshot message with timestamp
  const whatsappScreenshot = `
    551-5-5
    345-2-1
    456-3-2
    478-5-3 10:36 PM
  `;
  const r5 = parseClipboardTicketData(whatsappScreenshot);
  console.log('r5 result:', JSON.stringify(r5));
  assert(r5.length === 4, 'Exact WhatsApp screenshot parsed 4 ticket orders');
  assert(r5[0].number === '551' && r5[0].count === 5 && r5[0].boxCount === 5, '551: 5 super, 5 box');
  assert(r5[1].number === '345' && r5[1].count === 2 && r5[1].boxCount === 1, '345: 2 super, 1 box');
  assert(r5[2].number === '456' && r5[2].count === 3 && r5[2].boxCount === 2, '456: 3 super, 2 box');
  assert(r5[3].number === '478' && r5[3].count === 5 && r5[3].boxCount === 3, '478: 5 super, 3 box (timestamp 10:36 PM ignored)');
}

// 7. BOX Winning Formula Unit Tests
{
  console.log('Running BOX Winning Formula Unit Tests...');
  // Triples (e.g. 666 vs 666) -> 7000 prize, 300 comm
  const t1 = evaluateBoxWin('666', '666');
  assert(t1 !== null && t1.prizeAmount === 7000 && t1.superCommission === 300 && t1.winningPos === 'BOX_TRIPLE', 'Triples 666 wins 7000 prize, 300 comm');

  const t2 = evaluateBoxWin('111', '111');
  assert(t2 !== null && t2.prizeAmount === 7000 && t2.superCommission === 300, 'Triples 111 wins 7000 prize, 300 comm');

  const t0 = evaluateBoxWin('000', '000');
  assert(t0 !== null && t0.prizeAmount === 7000 && t0.superCommission === 300, 'Triples 000 wins 7000 prize, 300 comm');

  // Doubles Exact (121 vs 121) -> 3300 + 830 = 4130 prize, 300 + 30 = 330 comm
  const t3 = evaluateBoxWin('121', '121');
  assert(t3 !== null && t3.prizeAmount === 4130 && t3.superCommission === 330 && t3.winningPos === 'BOX_DOUBLE_1ST', 'Doubles exact 121 vs 121 wins 4130 (3300+830) prize, 330 (300+30) comm');

  const t4 = evaluateBoxWin('112', '112');
  assert(t4 !== null && t4.prizeAmount === 4130 && t4.superCommission === 330, 'Doubles exact 112 vs 112 wins 4130 prize, 330 comm');

  const t4b = evaluateBoxWin('448', '448');
  assert(t4b !== null && t4b.prizeAmount === 4130 && t4b.superCommission === 330, 'Doubles exact 448 vs 448 wins 4130 prize, 330 comm');

  // Doubles Reverse (121 vs 112) -> 830 + 830 = 1660 prize, 30 + 30 = 60 comm
  const t5 = evaluateBoxWin('121', '112');
  assert(t5 !== null && t5.prizeAmount === 1660 && t5.superCommission === 60 && t5.winningPos === 'BOX_DOUBLE_OTH', 'Doubles reverse 121 vs 112 wins 1660 (830+830) prize, 60 (30+30) comm');

  const t6 = evaluateBoxWin('313', '331');
  assert(t6 !== null && t6.prizeAmount === 1660 && t6.superCommission === 60, 'Doubles reverse 313 vs 331 wins 1660 prize, 60 comm');

  // Normal Mixed Exact (123 vs 123) -> 3000 prize, 300 comm
  const t7 = evaluateBoxWin('123', '123');
  assert(t7 !== null && t7.prizeAmount === 3000 && t7.superCommission === 300 && t7.winningPos === 'BOX_FIRST', 'Mixed exact 123 vs 123 wins 3000 prize, 300 comm');

  // Normal Mixed Reverse (123 vs 321) -> 800 prize, 30 comm
  const t8 = evaluateBoxWin('123', '321');
  assert(t8 !== null && t8.prizeAmount === 800 && t8.superCommission === 30 && t8.winningPos === 'BOX_OTHER', 'Mixed reverse 123 vs 321 wins 800 prize, 30 comm');

  const t9 = evaluateBoxWin('123', '213');
  assert(t9 !== null && t9.prizeAmount === 800 && t9.superCommission === 30, 'Mixed reverse 123 vs 213 wins 800 prize, 30 comm');

  // No Match (123 vs 456) -> null
  const t10 = evaluateBoxWin('123', '456');
  assert(t10 === null, 'No match 123 vs 456 returns null');
}

console.log('All ticket unit tests PASSED successfully!');

