import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execFileAsync = promisify(execFile);

test('CLI v2: --list-lenses displays all 11+ registered lenses', async () => {
  const { stdout } = await execFileAsync('node', ['./bin/termlens.js', '--list-lenses'], {
    cwd: process.cwd()
  });

  assert.equal(stdout.includes('go'), true);
  assert.equal(stdout.includes('python-lint'), true);
  assert.equal(stdout.includes('js-lint'), true);
  assert.equal(stdout.includes('clang'), true);
  assert.equal(stdout.includes('dotnet'), true);
  assert.equal(stdout.includes('jest'), true);
  assert.equal(stdout.includes('pytest'), true);
  assert.equal(stdout.includes('tsc'), true);
  assert.equal(stdout.includes('cargo'), true);
  assert.equal(stdout.includes('docker'), true);
  assert.equal(stdout.includes('generic'), true);
});

test('CLI v2: --version outputs v0.2.0', async () => {
  const { stdout } = await execFileAsync('node', ['./bin/termlens.js', '--version'], {
    cwd: process.cwd()
  });

  assert.equal(stdout.trim(), 'termlens v0.2.0');
});

test('CLI v2: --init creates termlens.config.json in target directory', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'termlens-init-'));

  const { stdout } = await execFileAsync('node', [path.resolve('./bin/termlens.js'), '--init'], {
    cwd: tmpDir
  });

  assert.equal(stdout.includes('Scaffolded starter configuration'), true);
  const createdConfig = path.join(tmpDir, 'termlens.config.json');
  assert.equal(fs.existsSync(createdConfig), true);

  const parsed = JSON.parse(fs.readFileSync(createdConfig, 'utf-8'));
  assert.equal(parsed.clusterErrors, true);
  assert.equal(parsed.customLenses.length > 0, true);

  fs.unlinkSync(createdConfig);
  fs.rmdirSync(tmpDir);
});

test('CLI v2: -o, --output writes compacted output directly to disk', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'termlens-out-'));
  const outFile = path.join(tmpDir, 'output.md');

  // Run a simple command with termlens writing to output file
  await execFileAsync('node', ['./bin/termlens.js', '-a', '-o', outFile, 'node', '-v'], {
    cwd: process.cwd()
  });

  assert.equal(fs.existsSync(outFile), true);
  const content = fs.readFileSync(outFile, 'utf-8');
  assert.equal(content.includes('Command Passed'), true);

  fs.unlinkSync(outFile);
  fs.rmdirSync(tmpDir);
});
