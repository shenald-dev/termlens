import test from 'node:test';
import assert from 'node:assert';
import { JestVitestLens } from '../dist/lenses/jest.js';
import { TscLens } from '../dist/lenses/tsc.js';
import { PytestLens } from '../dist/lenses/pytest.js';
import { DockerLens } from '../dist/lenses/docker.js';
import { GenericLens } from '../dist/lenses/generic.js';
import { normalizeLines } from '../dist/utils/ansi.js';
import {
  JEST_NOISY_FIXTURE,
  TSC_NOISY_FIXTURE,
  PYTEST_NOISY_FIXTURE,
  DOCKER_NOISY_FIXTURE
} from './fixtures/sample-logs.js';

test('JestVitestLens: isolates test failure, expected vs received, and stack frame', () => {
  const lens = new JestVitestLens();
  const lines = normalizeLines(JEST_NOISY_FIXTURE);
  assert.strictEqual(lens.canHandle('npm test', lines), true);

  const result = lens.process(lines, 1);
  assert.strictEqual(result.errors.length, 1);
  const err = result.errors[0];
  assert.strictEqual(err.file, 'src/auth/jwt.test.ts');
  assert.strictEqual(err.line, 42);
  assert.strictEqual(err.expected, '401');
  assert.strictEqual(err.received, '200');
  assert.ok(err.snippet?.includes('expect(response.status).toBe(401)'));
});

test('TscLens: parses multi-file type errors cleanly', () => {
  const lens = new TscLens();
  const lines = normalizeLines(TSC_NOISY_FIXTURE);
  assert.strictEqual(lens.canHandle('tsc --noEmit', lines), true);

  const result = lens.process(lines, 2);
  assert.strictEqual(result.errors.length, 4);
  assert.strictEqual(result.errors[0].file, 'src/server/auth.ts');
  assert.strictEqual(result.errors[0].line, 45);
  assert.strictEqual(result.errors[0].code, 'TS2345');
  assert.strictEqual(result.errors[3].file, 'src/services/payment.ts');
  assert.strictEqual(result.errors[3].code, 'TS2304');
});

test('PytestLens: extracts failed test assertion and python traceback', () => {
  const lens = new PytestLens();
  const lines = normalizeLines(PYTEST_NOISY_FIXTURE);
  assert.strictEqual(lens.canHandle('pytest -v', lines), true);

  const result = lens.process(lines, 1);
  assert.strictEqual(result.errors.length, 1);
  const err = result.errors[0];
  assert.strictEqual(err.file, 'tests/test_auth.py');
  assert.strictEqual(err.line, 48);
  assert.ok(err.message.includes('assert 401 == 200'));
});

test('DockerLens: pinpoints failing Dockerfile step and error code', () => {
  const lens = new DockerLens();
  const lines = normalizeLines(DOCKER_NOISY_FIXTURE);
  assert.strictEqual(lens.canHandle('docker build .', lines), true);

  const result = lens.process(lines, 1);
  assert.ok(result.errors.length >= 1);
  assert.strictEqual(result.errors[0].file, 'Dockerfile');
  assert.strictEqual(result.errors[0].line, 14);
});

test('GenericLens: identifies uncaught exceptions and file locations', () => {
  const lens = new GenericLens();
  const output = [
    'info: server booting',
    'debug: connecting to redis',
    'FATAL: EADDRINUSE: address already in use :::3000 at server.js:84:12',
    'exiting with error'
  ];
  const result = lens.process(output, 1);
  assert.strictEqual(result.errors.length, 1);
  assert.strictEqual(result.errors[0].file, 'server.js');
  assert.strictEqual(result.errors[0].line, 84);
});
