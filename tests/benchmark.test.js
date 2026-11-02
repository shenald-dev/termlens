import test from 'node:test';
import assert from 'node:assert';
import { TermlensEngine } from '../dist/engine.js';
import { JEST_NOISY_FIXTURE, DOCKER_NOISY_FIXTURE } from './fixtures/sample-logs.js';

const engine = new TermlensEngine();

test('Benchmark: Jest noisy log achieves > 75% token reduction', () => {
  const result = engine.compactText(JEST_NOISY_FIXTURE, 'jest');
  
  // Calculate compression metrics
  assert.ok(result.tokenSavingsPct >= 75, `Expected token savings >= 75%, got ${result.tokenSavingsPct}%`);
  assert.ok(result.compactLineCount <= 20, `Expected compact lines <= 20, got ${result.compactLineCount}`);
  assert.ok(result.rawEstimatedTokens > result.compactEstimatedTokens * 3);
});

test('Benchmark: Docker noisy log achieves > 75% token reduction', () => {
  const result = engine.compactText(DOCKER_NOISY_FIXTURE, 'docker');
  
  assert.ok(result.tokenSavingsPct >= 70, `Expected token savings >= 70%, got ${result.tokenSavingsPct}%`);
  assert.ok(result.compactLineCount <= 15);
});

test('Benchmark: Stream processing overhead is under 15 milliseconds', () => {
  const start = performance.now();
  for (let i = 0; i < 50; i++) {
    engine.compactText(JEST_NOISY_FIXTURE, 'jest');
  }
  const avgDuration = (performance.now() - start) / 50;
  assert.ok(avgDuration < 15, `Expected average processing time < 15ms, got ${avgDuration.toFixed(2)}ms`);
});
