import test from 'node:test';
import assert from 'node:assert';
import { stripAnsi, normalizeLines, estimateTokens } from '../dist/utils/ansi.js';

test('stripAnsi: removes standard color and style codes', () => {
  const redText = '\u001b[31mError:\u001b[0m test failed';
  assert.strictEqual(stripAnsi(redText), 'Error: test failed');
});

test('stripAnsi: removes multi-byte and cursor repositioning codes', () => {
  const spinner = '\u001b[2K\u001b[1G⠋ Building...';
  assert.strictEqual(stripAnsi(spinner), '⠋ Building...');
});

test('normalizeLines: collapses carriage return spinner lines', () => {
  const stream = 'Step 1\rStep 2\rFinal Result\nSecond Line';
  const lines = normalizeLines(stream);
  assert.deepStrictEqual(lines, ['Final Result', 'Second Line']);
});

test('estimateTokens: calculates token estimates correctly', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens('abcd'), 2); // 4 / 3.8 = ~1.05 -> ceil -> 2
  assert.strictEqual(estimateTokens(380), 100);  // 380 / 3.8 = 100
});
