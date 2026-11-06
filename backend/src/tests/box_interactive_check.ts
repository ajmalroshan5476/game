import { evaluateBoxWin } from '../services/result.service.js';

const betNumber = (process.argv[2] || '121').trim();
const firstPrize = (process.argv[3] || '121').trim();
const quantity = parseInt(process.argv[4] || '1', 10);

console.log('\n======================================================');
console.log('BOX WINNING FORMULA - LOCAL CHECKER');
console.log('======================================================');
console.log(`Input Bet Number:  ${betNumber}`);
console.log(`Draw 1st Prize:    ${firstPrize}`);
console.log(`Quantity:          ${quantity}`);
console.log('------------------------------------------------------');

const result = evaluateBoxWin(betNumber, firstPrize);

if (!result) {
  console.log('Result: NO WIN (Ticket does not match winning digits)');
} else {
  const prizeTotal = result.prizeAmount * quantity;
  const commTotal = result.superCommission * quantity;
  console.log(`Result:            WINNER!`);
  console.log(`Category:          ${result.winningPos}`);
  console.log(`Unit Prize:        ₹${result.prizeAmount.toLocaleString('en-IN')}`);
  console.log(`Unit Commission:   ₹${result.superCommission.toLocaleString('en-IN')}`);
  console.log(`Total Prize (x${quantity}):  ₹${prizeTotal.toLocaleString('en-IN')}`);
  console.log(`Total Comm (x${quantity}):   ₹${commTotal.toLocaleString('en-IN')}`);
}
console.log('======================================================\n');

