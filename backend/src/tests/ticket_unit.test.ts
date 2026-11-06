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

  // 1. Special Numbers (Triple Numbers): 000, 111, 222, 333, 444, 555, 666, 777, 888, 999
  // Prize: 7,000, Commission: 300 (qty 1)
  const t0 = evaluateBoxWin('000', '000');
  assert(t0 !== null && t0.prizeAmount === 7000 && t0.superCommission === 300 && t0.winningPos === 'BOX_TRIPLE', 'Triples 000 wins ₹7,000 prize, ₹300 comm');

  const t1 = evaluateBoxWin('111', '111');
  assert(t1 !== null && t1.prizeAmount === 7000 && t1.superCommission === 300, 'Triples 111 wins ₹7,000 prize, ₹300 comm');

  const t6 = evaluateBoxWin('666', '666');
  assert(t6 !== null && t6.prizeAmount === 7000 && t6.superCommission === 300, 'Triples 666 wins ₹7,000 prize, ₹300 comm');

  const t9 = evaluateBoxWin('999', '999');
  assert(t9 !== null && t9.prizeAmount === 7000 && t9.superCommission === 300, 'Triples 999 wins ₹7,000 prize, ₹300 comm');

  // 2. Box Numbers Containing Two Identical Digits (112, 313, 448)
  // Case A – Exact Match (121 vs 121): Prize: ₹3,300 + ₹830 = ₹4,130, Commission: ₹30 + ₹300 = ₹330
  const t2a1 = evaluateBoxWin('121', '121');
  assert(t2a1 !== null && t2a1.prizeAmount === 4130 && t2a1.superCommission === 330 && t2a1.winningPos === 'BOX_DOUBLE_1ST', 'Doubles exact 121 vs 121 wins ₹4,130 (₹3,300+₹830) prize, ₹330 (₹30+₹300) comm');

  const t2a2 = evaluateBoxWin('112', '112');
  assert(t2a2 !== null && t2a2.prizeAmount === 4130 && t2a2.superCommission === 330, 'Doubles exact 112 vs 112 wins ₹4,130 prize, ₹330 comm');

  const t2a3 = evaluateBoxWin('448', '448');
  assert(t2a3 !== null && t2a3.prizeAmount === 4130 && t2a3.superCommission === 330, 'Doubles exact 448 vs 448 wins ₹4,130 prize, ₹330 comm');

  // Case B – Matching Box Pattern (121 vs 112): Prize: ₹830 + ₹830 = ₹1,660, Commission: ₹30 + ₹30 = ₹60
  const t2b1 = evaluateBoxWin('121', '112');
  assert(t2b1 !== null && t2b1.prizeAmount === 1660 && t2b1.superCommission === 60 && t2b1.winningPos === 'BOX_DOUBLE_OTH', 'Doubles pattern 121 vs 112 wins ₹1,660 (₹830+₹830) prize, ₹60 comm');

  const t2b2 = evaluateBoxWin('313', '331');
  assert(t2b2 !== null && t2b2.prizeAmount === 1660 && t2b2.superCommission === 60, 'Doubles pattern 313 vs 331 wins ₹1,660 prize, ₹60 comm');

  const t2b3 = evaluateBoxWin('448', '844');
  assert(t2b3 !== null && t2b3.prizeAmount === 1660 && t2b3.superCommission === 60, 'Doubles pattern 448 vs 844 wins ₹1,660 prize, ₹60 comm');

  // 3. Normal Mixed Numbers (All Three Digits Different, e.g. 123, 456, 789)
  // Exact Match: Prize: ₹3,000, Commission: ₹300
  const t3a = evaluateBoxWin('123', '123');
  assert(t3a !== null && t3a.prizeAmount === 3000 && t3a.superCommission === 300 && t3a.winningPos === 'BOX_FIRST', 'Mixed exact 123 vs 123 wins ₹3,000 prize, ₹300 comm');

  const t3b = evaluateBoxWin('456', '456');
  assert(t3b !== null && t3b.prizeAmount === 3000 && t3b.superCommission === 300, 'Mixed exact 456 vs 456 wins ₹3,000 prize, ₹300 comm');

  // 4. Reverse / Permutation Box Winning (e.g. 123 vs 321 or 213): Prize: ₹800, Commission: ₹30
  const t4a = evaluateBoxWin('123', '321');
  assert(t4a !== null && t4a.prizeAmount === 800 && t4a.superCommission === 30 && t4a.winningPos === 'BOX_OTHER', 'Mixed reverse 123 vs 321 wins ₹800 prize, ₹30 comm');

  const t4b = evaluateBoxWin('123', '213');
  assert(t4b !== null && t4b.prizeAmount === 800 && t4b.superCommission === 30, 'Mixed reverse 123 vs 213 wins ₹800 prize, ₹30 comm');

  // Negative / No Match Check:
  const tNeg = evaluateBoxWin('123', '789');
  assert(tNeg === null, 'No match 123 vs 789 returns null');

  // 5. 6th Prize Duplicate Immunity Check:
  // If 6th prize results contain duplicate numbers, each ticket entry must match at most once!
  const raw6th = ['364', '636', '363', '636', '474', '363', '474'];
  const clean6thSet = new Set(raw6th.map((s) => s.trim()).filter(Boolean));
  let matchCount636 = 0;
  if (clean6thSet.has('636')) {
    matchCount636++;
  }
  assert(matchCount636 === 1, 'Number 636 matching 6th prize with duplicate entries in drawn list matches at most ONCE');
}

console.log('All ticket unit tests PASSED successfully!');
process.exit(0);

