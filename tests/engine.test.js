import test from 'node:test';
import assert from 'node:assert';
import { TermlensEngine } from '../dist/engine.js';

const engine = new TermlensEngine();

test('TermlensEngine: executes a real passing command and preserves status', async () => {
  const result = await engine.execute('node -e "console.log(\'healthy\')"', { agentMode: true });
  assert.strictEqual(result.exitCode, 0);
  assert.strictEqual(result.status, 'success');
  assert.ok(result.agentFormatted.includes('Command Passed'));
});

test('TermlensEngine: captures child failure exit code and isolates error', async () => {
  const result = await engine.execute('node -e "console.error(\'Error: database timeout at db.js:10:4\'); process.exit(1)"');
  assert.strictEqual(result.exitCode, 1);
  assert.strictEqual(result.status, 'failure');
  assert.ok(result.errors.length > 0);
  assert.strictEqual(result.errors[0].file, 'db.js');
});

test('TermlensEngine: generates valid structured JSON output', async () => {
  const result = await engine.execute('node -e "console.log(\'json test\')"', { jsonMode: true });
  const parsed = JSON.parse(result.jsonFormatted);
  assert.strictEqual(parsed.exitCode, 0);
  assert.strictEqual(parsed.status, 'success');
  assert.strictEqual(typeof parsed.tokenSavingsPct, 'number');
});

test('TermlensEngine: handles process timeout gracefully', async () => {
  // Spawn a process that sleeps longer than timeout
  const result = await engine.execute('node -e "setTimeout(() => {}, 5000)"', { timeoutMs: 250 });
  assert.strictEqual(result.status, 'timeout');
  assert.strictEqual(result.exitCode, 124);
  assert.ok(result.summary.includes('timed out'));
});

test('TermlensEngine: compactText processes raw log strings without child process', () => {
  const passingLines = Array.from({ length: 25 }, (_, i) => `  PASS  src/component_${i}.test.ts (0.5s)`).join('\n');
  const rawLog = `${passingLines}\n  FAIL  src/auth/token.test.ts\n  ● should verify signature\n    Expected: 200\n    Received: 401\nTests: 1 failed, 25 passed, 26 total`;
  const result = engine.compactText(rawLog, 'jest');
  assert.strictEqual(result.status, 'failure');
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].expected, '200');
  assert.strictEqual(result.errors[0].received, '401');
  assert.ok(result.tokenSavingsPct > 50, `Expected token savings > 50%, got ${result.tokenSavingsPct}%`);
});
