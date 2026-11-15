import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('CLI v3: flight list executes cleanly and prints header', async () => {
  const { stdout } = await execFileAsync('node', ['./bin/termlens.js', 'flight', 'list'], {
    cwd: process.cwd()
  });

  assert.ok(stdout.includes('Flight Recordings') || stdout.includes('No flight recordings'));
});

test('CLI v3: --no-source and --no-flight execution flags succeed', async () => {
  const { stdout } = await execFileAsync('node', ['./bin/termlens.js', '-a', '--no-source', '--no-flight', 'node', '-v'], {
    cwd: process.cwd()
  });

  assert.ok(stdout.includes('Command Passed'));
});

test('CLI v3: --list-lenses includes node-test, bundler, and gradle-maven', async () => {
  const { stdout } = await execFileAsync('node', ['./bin/termlens.js', '--list-lenses'], {
    cwd: process.cwd()
  });

  assert.ok(stdout.includes('node-test'));
  assert.ok(stdout.includes('bundler'));
  assert.ok(stdout.includes('gradle-maven'));
});
