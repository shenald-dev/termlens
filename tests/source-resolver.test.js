import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SourceContextResolver } from '../dist/utils/source-resolver.js';

test('SourceContextResolver: resolves context lines and formats snippet with line pointer', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'termlens-src-'));
  const testFile = path.join(tmpDir, 'sample.ts');
  const code = [
    'export function add(a: number, b: number): number {',
    '  const res = a + b;',
    '  if (res < 0) throw new Error("Negative");',
    '  return res;',
    '}'
  ].join('\n');
  fs.writeFileSync(testFile, code, 'utf-8');

  const resolver = new SourceContextResolver();
  const context = resolver.resolve(testFile, 3, 10, tmpDir, 1);

  assert.ok(context !== null);
  assert.equal(context.line, 3);
  assert.equal(context.lines.length, 3);
  assert.equal(context.lines[1].isTarget, true);
  assert.equal(context.lines[1].lineNum, 3);
  assert.ok(context.formattedSnippet.includes('> 3 |   if (res < 0) throw new Error("Negative");'));

  fs.unlinkSync(testFile);
  fs.rmdirSync(tmpDir);
});

test('SourceContextResolver: enriches error details safely and skips invalid/nonexistent paths', () => {
  const resolver = new SourceContextResolver();
  const errors = [
    { message: 'General failure without file' },
    { file: 'does_not_exist_xyz123.ts', line: 10, message: 'Missing file error' },
    { file: 'package.json', line: 2, message: 'Valid file line 2' }
  ];

  resolver.enrichErrors(errors, process.cwd());

  assert.equal(errors[0].sourceContext, undefined);
  assert.equal(errors[1].sourceContext, undefined);
  assert.ok(errors[2].sourceContext !== undefined);
  assert.ok(errors[2].snippet !== undefined);
  assert.ok(errors[2].snippet.includes('>'));
});

test('SourceContextResolver: guards against line overflow and boundary conditions', () => {
  const resolver = new SourceContextResolver();
  const resultNegative = resolver.resolve('package.json', -5);
  assert.equal(resultNegative, null);

  const resultOverflow = resolver.resolve('package.json', 999999);
  assert.equal(resultOverflow, null);
});
