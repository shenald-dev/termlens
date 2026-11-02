import test from 'node:test';
import assert from 'node:assert';
import { RingBuffer } from '../dist/utils/ring-buffer.js';

test('RingBuffer: stores and retrieves items within capacity', () => {
  const rb = new RingBuffer(5);
  rb.push('A');
  rb.push('B');
  rb.push('C');
  assert.deepStrictEqual(rb.toArray(), ['A', 'B', 'C']);
  assert.strictEqual(rb.totalPushed, 3);
});

test('RingBuffer: rolls over accurately when capacity is exceeded', () => {
  const rb = new RingBuffer(3);
  rb.push('1');
  rb.push('2');
  rb.push('3');
  rb.push('4');
  rb.push('5');

  assert.deepStrictEqual(rb.toArray(), ['3', '4', '5']);
  assert.strictEqual(rb.totalPushed, 5);
});

test('RingBuffer: handles massive insertions with zero memory leak', () => {
  const rb = new RingBuffer(100);
  for (let i = 0; i < 50000; i++) {
    rb.push(`line ${i}`);
  }
  const result = rb.toArray();
  assert.strictEqual(result.length, 100);
  assert.strictEqual(result[0], 'line 49900');
  assert.strictEqual(result[99], 'line 49999');
  assert.strictEqual(rb.totalPushed, 50000);
});
