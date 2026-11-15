import test from 'node:test';
import assert from 'node:assert/strict';
import { RemediationEngine } from '../dist/utils/remediation.js';

test('RemediationEngine: detects missing Node package and synthesizes install command', () => {
  const engine = new RemediationEngine();
  const errors = [
    { message: "Cannot find module 'lodash-es' or its corresponding type declarations." }
  ];

  const plans = engine.analyze(errors, 'npm test');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].category, 'MISSING_DEPENDENCY');
  assert.equal(plans[0].suggestedCommand, 'npm install lodash-es');
  assert.equal(plans[0].confidence, 'high');
});

test('RemediationEngine: detects missing Python package and suggests pip install', () => {
  const engine = new RemediationEngine();
  const errors = [
    { message: "ModuleNotFoundError: No module named 'pydantic'" }
  ];

  const plans = engine.analyze(errors, 'pytest');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].category, 'MISSING_PYTHON_PACKAGE');
  assert.equal(plans[0].suggestedCommand, 'pip install pydantic');
});

test('RemediationEngine: detects TypeScript type mismatches and recommends patch', () => {
  const engine = new RemediationEngine();
  const errors = [
    {
      code: 'TS2322',
      file: 'src/user.ts',
      line: 42,
      message: "Type 'string' is not assignable to type 'number'."
    }
  ];

  const plans = engine.analyze(errors, 'tsc');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].category, 'TYPE_MISMATCH');
  assert.ok(plans[0].patchHypothesis.includes('src/user.ts:42'));
});

test('RemediationEngine: detects missing property on interface (TS2339)', () => {
  const engine = new RemediationEngine();
  const errors = [
    {
      code: 'TS2339',
      message: "Property 'email' does not exist on type 'UserProfile'."
    }
  ];

  const plans = engine.analyze(errors, 'tsc');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].category, 'PROPERTY_MISSING');
  assert.ok(plans[0].explanation.includes("'email'"));
  assert.ok(plans[0].explanation.includes("'UserProfile'"));
});

test('RemediationEngine: detects linter autofixable command', () => {
  const engine = new RemediationEngine();
  const errors = [
    { message: 'Missing trailing comma (comma-dangle)' }
  ];

  const plans = engine.analyze(errors, 'npx eslint src/');
  assert.equal(plans.length, 1);
  assert.equal(plans[0].category, 'LINT_AUTOFIX');
  assert.equal(plans[0].suggestedCommand, 'npx eslint --fix .');
});

test('RemediationEngine: detects port collision and memory exhaustion', () => {
  const engine = new RemediationEngine();
  const portPlans = engine.analyze([{ message: 'listen EADDRINUSE: address already in use :::3000' }]);
  assert.equal(portPlans.length, 1);
  assert.equal(portPlans[0].category, 'PORT_IN_USE');

  const oomPlans = engine.analyze([{ message: 'FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory' }]);
  assert.equal(oomPlans.length, 1);
  assert.equal(oomPlans[0].category, 'OUT_OF_MEMORY');
  assert.ok(oomPlans[0].suggestedCommand.includes('--max-old-space-size=4096'));
});
