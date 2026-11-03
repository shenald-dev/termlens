import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTelemetry } from '../dist/utils/telemetry.js';
import { formatCiAnnotations } from '../dist/formatters/ci.js';
import { formatAgent } from '../dist/formatters/agent.js';

test('calculateTelemetry: accurately calculates token and financial cost savings', () => {
  const rawText = 'A'.repeat(3800); // ~1000 tokens
  const compactText = 'B'.repeat(380); // ~100 tokens

  const metrics = calculateTelemetry(500, 10, rawText, compactText);

  assert.equal(metrics.rawEstimatedTokens, 1000);
  assert.equal(metrics.compactEstimatedTokens, 100);
  assert.equal(metrics.tokensSaved, 900);
  assert.equal(metrics.tokenSavingsPct, 90.0);
  assert.equal(metrics.estimatedCostSavingsUsd > 0.002, true);
});

test('formatCiAnnotations: generates GitHub Actions workflow commands', () => {
  const mockResult = {
    command: 'npm test',
    exitCode: 1,
    durationMs: 120,
    lensUsed: 'jest',
    status: 'failure',
    rawLineCount: 50,
    rawCharCount: 2000,
    compactLineCount: 3,
    compactCharCount: 150,
    tokenSavingsPct: 92.5,
    rawEstimatedTokens: 500,
    compactEstimatedTokens: 40,
    estimatedCostSavingsUsd: 0.0013,
    summary: '1 test failed',
    errors: [
      {
        file: 'src/auth.test.ts',
        line: 42,
        column: 15,
        code: 'ERR_AUTH',
        message: 'Expected 401 but received 200'
      }
    ],
    clusters: [],
    highlights: [],
    rawTail: [],
    humanFormatted: '',
    agentFormatted: '',
    jsonFormatted: ''
  };

  const ciOutput = formatCiAnnotations(mockResult);

  assert.equal(ciOutput.includes('::error'), true);
  assert.equal(ciOutput.includes('file=src/auth.test.ts'), true);
  assert.equal(ciOutput.includes('line=42'), true);
  assert.equal(ciOutput.includes('col=15'), true);
  assert.equal(ciOutput.includes('title=ERR_AUTH'), true);
  assert.equal(ciOutput.includes('Expected 401 but received 200'), true);
});

test('quietSuccess: formatAgent returns minimal zero-token output on clean runs', () => {
  const passingResult = {
    command: 'npm test',
    exitCode: 0,
    durationMs: 80,
    lensUsed: 'jest',
    status: 'success',
    rawLineCount: 200,
    rawCharCount: 8000,
    compactLineCount: 1,
    compactCharCount: 20,
    tokenSavingsPct: 99.0,
    rawEstimatedTokens: 2000,
    compactEstimatedTokens: 5,
    estimatedCostSavingsUsd: 0.005,
    summary: 'All 85 tests passed',
    errors: [],
    clusters: [],
    highlights: ['✓ 85 tests passed'],
    rawTail: [],
    humanFormatted: '',
    agentFormatted: '',
    jsonFormatted: ''
  };

  const quietOutput = formatAgent(passingResult, true);
  assert.equal(quietOutput, '✓ `npm test` passed');
});
