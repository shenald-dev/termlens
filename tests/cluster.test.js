import test from 'node:test';
import assert from 'node:assert/strict';
import { clusterErrors } from '../dist/utils/cluster.js';

test('clusterErrors: deduplicates cascading identical errors into a single cluster', () => {
  const errors = [];
  for (let i = 1; i <= 20; i++) {
    errors.push({
      file: `src/api/service_${i}.test.ts`,
      line: 42 + i,
      message: 'connect ECONNREFUSED 127.0.0.1:5432'
    });
  }

  const result = clusterErrors(errors, 5);

  assert.equal(result.totalOriginal, 20);
  assert.equal(result.deduplicatedCount, 1);
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].isClustered, true);
  assert.equal(result.clusters[0].occurrences, 20);
  assert.equal(result.clusters[0].locations.length, 20);
});

test('clusterErrors: preserves unique errors while clustering duplicates', () => {
  const errors = [
    { file: 'src/a.ts', line: 10, message: 'Type mismatch: expected number got string' },
    { file: 'src/b.ts', line: 20, message: 'Type mismatch: expected number got string' },
    { file: 'src/c.ts', line: 30, message: 'Module not found: @/auth/jwt' },
    { file: 'src/d.ts', line: 40, message: 'SyntaxError: Unexpected token' }
  ];

  const result = clusterErrors(errors, 10);

  assert.equal(result.totalOriginal, 4);
  assert.equal(result.deduplicatedCount, 3);
  assert.equal(result.clusters.length, 3);

  const clusteredItem = result.clusters.find(c => c.isClustered);
  assert.equal(clusteredItem !== undefined, true);
  assert.equal(clusteredItem.occurrences, 2);
});

test('clusterErrors: respects maxErrors ceiling and reports omittedCount', () => {
  const errors = [];
  for (let i = 0; i < 15; i++) {
    errors.push({
      file: `src/unique_${i}.ts`,
      line: i + 1,
      message: `Unique error code ${i}`
    });
  }

  const result = clusterErrors(errors, 4);

  assert.equal(result.totalOriginal, 15);
  assert.equal(result.clusters.length, 4);
  assert.equal(result.omittedCount, 11);
});
