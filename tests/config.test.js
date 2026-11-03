import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, generateStarterConfig } from '../dist/config.js';

test('loadConfig: returns defaults when no configuration file is present', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'termlens-test-'));
  const config = loadConfig(tmpDir);

  assert.equal(config.quietSuccess, false);
  assert.equal(config.tailLines, 8);
  assert.equal(config.maxErrors, 8);
  assert.equal(config.clusterErrors, true);
  fs.rmdirSync(tmpDir);
});

test('loadConfig: loads settings from termlens.config.json', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'termlens-test-'));
  const configFile = path.join(tmpDir, 'termlens.config.json');

  fs.writeFileSync(configFile, JSON.stringify({
    quietSuccess: true,
    tailLines: 15,
    maxErrors: 4,
    defaultLens: 'jest'
  }), 'utf-8');

  const config = loadConfig(tmpDir);

  assert.equal(config.quietSuccess, true);
  assert.equal(config.tailLines, 15);
  assert.equal(config.maxErrors, 4);
  assert.equal(config.defaultLens, 'jest');

  fs.unlinkSync(configFile);
  fs.rmdirSync(tmpDir);
});

test('generateStarterConfig: produces parseable valid JSON configuration', () => {
  const starter = generateStarterConfig();
  const parsed = JSON.parse(starter);

  assert.equal(parsed.clusterErrors, true);
  assert.equal(Array.isArray(parsed.customLenses), true);
  assert.equal(parsed.customLenses.length > 0, true);
});
