import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GolangLens,
  PythonLintLens,
  JsLintLens,
  ClangLens,
  DotnetLens,
  CustomLens
} from '../dist/lenses/index.js';
import {
  GO_NOISY_FIXTURE,
  PYTHON_LINT_FIXTURE,
  JS_LINT_FIXTURE,
  CLANG_NOISY_FIXTURE,
  DOTNET_NOISY_FIXTURE
} from './fixtures/sample-logs.js';

test('GolangLens: parses test failures, assertion messages, and locations', () => {
  const lens = new GolangLens();
  assert.equal(lens.canHandle('go test ./...', []), true);

  const lines = GO_NOISY_FIXTURE.trim().split('\n');
  const result = lens.process(lines, 1);

  assert.equal(result.errors.length >= 1, true);
  const err = result.errors[0];
  assert.equal(err.message.includes('TestUserAuthentication'), true);
  assert.equal(err.file, 'auth_test.go');
  assert.equal(err.line, 45);
});

test('PythonLintLens: extracts ruff error codes, locations, and mypy type issues', () => {
  const lens = new PythonLintLens();
  assert.equal(lens.canHandle('ruff check .', []), true);

  const lines = PYTHON_LINT_FIXTURE.trim().split('\n');
  const result = lens.process(lines, 1);

  assert.equal(result.errors.length, 3);
  assert.equal(result.errors[0].file, 'src/server/auth.py');
  assert.equal(result.errors[0].code, 'F401');
  assert.equal(result.errors[1].code, 'E501');
  assert.equal(result.errors[2].code, 'return-value');
});

test('JsLintLens: parses ESLint and Biome violations with rules and coordinates', () => {
  const lens = new JsLintLens();
  assert.equal(lens.canHandle('eslint src/', []), true);

  const lines = JS_LINT_FIXTURE.trim().split('\n');
  const result = lens.process(lines, 1);

  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].file, '/app/src/index.ts');
  assert.equal(result.errors[0].line, 15);
  assert.equal(result.errors[0].column, 3);
  assert.equal(result.errors[0].code, '@typescript-eslint/no-unused-vars');
});

test('ClangLens: isolates C/C++ compiler diagnostics and code snippet lines', () => {
  const lens = new ClangLens();
  assert.equal(lens.canHandle('make -j4', []), true);

  const lines = CLANG_NOISY_FIXTURE.trim().split('\n');
  const result = lens.process(lines, 1);

  assert.equal(result.errors.length >= 1, true);
  assert.equal(result.errors[0].file, 'src/main.cpp');
  assert.equal(result.errors[0].line, 42);
  assert.equal(result.errors[0].column, 15);
  assert.equal(result.errors[0].message.includes("expected ';'"), true);
  assert.equal(result.errors[0].snippet !== undefined, true);
});

test('DotnetLens: isolates CS errors, failed test namespaces, and assertions', () => {
  const lens = new DotnetLens();
  assert.equal(lens.canHandle('dotnet test', []), true);

  const lines = DOTNET_NOISY_FIXTURE.trim().split('\n');
  const result = lens.process(lines, 1);

  assert.equal(result.errors.length >= 2, true);
  assert.equal(result.errors[0].file, 'Controllers/UserController.cs');
  assert.equal(result.errors[0].line, 45);
  assert.equal(result.errors[0].code, 'CS1503');
  assert.equal(result.errors[1].code, 'CS0103');
});

test('CustomLens: dynamically matches user-defined error patterns and groups', () => {
  const customDef = {
    name: 'ruby-rubocop',
    matchCommand: 'rubocop',
    errorPattern: '([a-zA-Z0-9_./-]+):(\\d+):(\\d+):\\s+([CWE]):\\s+(.*)',
    fileGroup: 1,
    lineGroup: 2,
    colGroup: 3,
    codeGroup: 4,
    messageGroup: 5
  };

  const lens = new CustomLens(customDef);
  assert.equal(lens.canHandle('bundle exec rubocop', []), true);

  const lines = [
    'app/models/user.rb:14:5: C: Style/StringLiterals: Prefer single-quoted strings.',
    'app/controllers/auth.rb:28:1: W: Lint/UselessAssignment: Useless assignment to variable.'
  ];

  const result = lens.process(lines, 1);
  assert.equal(result.errors.length, 2);
  assert.equal(result.errors[0].file, 'app/models/user.rb');
  assert.equal(result.errors[0].line, 14);
  assert.equal(result.errors[0].column, 5);
  assert.equal(result.errors[0].code, 'C');
  assert.equal(result.errors[0].message.includes('Style/StringLiterals'), true);
});
