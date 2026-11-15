import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FlightRecorder } from '../dist/flight/recorder.js';
import { diffFlights } from '../dist/flight/diff.js';

test('FlightRecorder: records, retrieves, and lists flights with auto-pruning', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'termlens-flight-'));
  const recorder = new FlightRecorder(tmpDir, 3);

  const mockResult1 = {
    command: 'npm test',
    exitCode: 1,
    durationMs: 150,
    lensUsed: 'jest',
    status: 'failure',
    rawLineCount: 100,
    rawCharCount: 2000,
    compactLineCount: 5,
    compactCharCount: 200,
    tokenSavingsPct: 90,
    rawEstimatedTokens: 500,
    compactEstimatedTokens: 50,
    estimatedCostSavingsUsd: 0.001,
    summary: '1 failure',
    errors: [{ message: 'Assertion failed', file: 'auth.test.ts', line: 10 }],
    clusters: [{ exemplar: { message: 'Assertion failed', file: 'auth.test.ts', line: 10 }, occurrences: 1, locations: [], isClustered: false }],
    highlights: [],
    rawTail: [],
    humanFormatted: '',
    agentFormatted: '',
    jsonFormatted: ''
  };

  const rec1 = await recorder.record(mockResult1, process.cwd());
  assert.ok(rec1 !== null);
  assert.ok(rec1.id.startsWith('flt_'));

  const retrieved = recorder.get(rec1.id);
  assert.ok(retrieved !== null);
  assert.equal(retrieved.command, 'npm test');
  assert.equal(retrieved.status, 'failure');

  const latest = recorder.getLatest();
  assert.ok(latest !== null);
  assert.equal(latest.id, rec1.id);

  // Record additional flights to test pruning limit (limit = 3)
  await recorder.record(mockResult1, process.cwd());
  await recorder.record(mockResult1, process.cwd());
  await recorder.record(mockResult1, process.cwd());

  const list = recorder.list(10);
  assert.ok(list.length <= 3);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('FlightDiff: accurately detects resolved, new, and persistent failures', () => {
  const baseFlight = {
    id: 'flt_run_1',
    timestamp: '2026-11-15T10:00:00Z',
    command: 'npm test',
    cwd: process.cwd(),
    exitCode: 1,
    durationMs: 200,
    status: 'failure',
    lensUsed: 'jest',
    summary: '2 errors',
    errorCount: 2,
    clusterCount: 2,
    clusters: [
      { exemplar: { message: 'Type mismatch in token', file: 'src/jwt.ts', line: 12, code: 'TS2322' }, occurrences: 1, locations: [], isClustered: false },
      { exemplar: { message: 'Expected 200 got 500', file: 'tests/api.test.ts', line: 40 }, occurrences: 1, locations: [], isClustered: false }
    ],
    errors: [],
    remediations: [],
    telemetry: { rawLines: 100, compactLines: 10, rawEstimatedTokens: 500, compactEstimatedTokens: 50, tokensSaved: 450, tokenSavingsPct: 90, estimatedCostSavingsUsd: 0.001 }
  };

  const targetFlight = {
    id: 'flt_run_2',
    timestamp: '2026-11-15T10:05:00Z',
    command: 'npm test',
    cwd: process.cwd(),
    exitCode: 1,
    durationMs: 180,
    status: 'failure',
    lensUsed: 'jest',
    summary: '2 errors',
    errorCount: 2,
    clusterCount: 2,
    clusters: [
      // Persistent: Expected 200 got 500
      { exemplar: { message: 'Expected 200 got 500', file: 'tests/api.test.ts', line: 40 }, occurrences: 1, locations: [], isClustered: false },
      // New / Regressed: Syntax error in routes
      { exemplar: { message: 'Unexpected token in routes', file: 'src/routes.ts', line: 5 }, occurrences: 1, locations: [], isClustered: false }
    ],
    errors: [],
    remediations: [],
    telemetry: { rawLines: 100, compactLines: 10, rawEstimatedTokens: 500, compactEstimatedTokens: 50, tokensSaved: 450, tokenSavingsPct: 90, estimatedCostSavingsUsd: 0.001 }
  };

  const diff = diffFlights(baseFlight, targetFlight);

  assert.equal(diff.resolvedCount, 1);
  assert.equal(diff.newCount, 1);
  assert.equal(diff.persistentCount, 1);
  assert.equal(diff.resolvedErrors[0].exemplar.file, 'src/jwt.ts');
  assert.equal(diff.newErrors[0].exemplar.file, 'src/routes.ts');
  assert.equal(diff.persistentErrors[0].exemplar.file, 'tests/api.test.ts');
  assert.ok(diff.markdown.includes('Resolved Failures'));
  assert.ok(diff.markdown.includes('New / Regressed Failures'));
  assert.ok(diff.markdown.includes('Persistent Failures'));
});

test('FlightRecorder: guards against path traversal in get()', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'termlens-flight-sec-'));
  const recorder = new FlightRecorder(tmpDir);

  // Attempt to read files outside baseDir via traversal
  assert.equal(recorder.get('../../package.json'), null);
  assert.equal(recorder.get('../something.json'), null);
  assert.equal(recorder.get('..\\something.json'), null);
  assert.equal(recorder.get('/etc/passwd'), null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
