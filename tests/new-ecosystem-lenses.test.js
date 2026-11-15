import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeTestLens } from '../dist/lenses/node-runner.js';
import { BundlerLens } from '../dist/lenses/bundler.js';
import { GradleMavenLens } from '../dist/lenses/gradle-maven.js';

test('NodeTestLens: parses TAP test failures, assertion codes, and locations', () => {
  const lens = new NodeTestLens();
  assert.equal(lens.canHandle('node --test tests/', []), true);
  assert.equal(lens.canHandle('npm test', ['TAP version 13', '# Subtest: suite']), true);

  const sampleTapLog = [
    'TAP version 13',
    '# Subtest: math.test.js',
    'ok 1 - math.test.js',
    '# Subtest: failing auth assertion',
    'not ok 2 - failing auth assertion',
    '  ---',
    '  duration_ms: 2.1',
    '  failureType: \'testCodeFailure\'',
    '  error: \'Expected values to be strictly equal: 200 !== 401\'',
    '  code: \'ERR_ASSERTION\'',
    '  expected: 401',
    '  actual: 200',
    '  stack: |-',
    '    TestContext.<anonymous> (tests/auth.test.js:42:15)',
    '    node:internal/test_runner/test:1047:25',
    '  ...',
    '1..2',
    '# tests 2',
    '# pass 1',
    '# fail 1'
  ];

  const result = lens.process(sampleTapLog, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].file, 'tests/auth.test.js');
  assert.equal(result.errors[0].line, 42);
  assert.equal(result.errors[0].column, 15);
  assert.equal(result.errors[0].code, 'ERR_ASSERTION');
  assert.equal(result.errors[0].expected, '401');
  assert.equal(result.errors[0].received, '200');
  assert.ok(result.highlights[0].includes('1/2 tests passed, 1 failed'));
});

test('BundlerLens: isolates Vite, Webpack, and esbuild compilation diagnostics', () => {
  const lens = new BundlerLens();
  assert.equal(lens.canHandle('vite build', []), true);
  assert.equal(lens.canHandle('npm run build', ['[vite] Internal server error']), true);

  const viteLog = [
    '[vite] Internal server error: Failed to parse source for import analysis',
    '  Plugin: vite:import-analysis',
    '  File: src/components/Header.tsx:14:8',
    '  > 14 | import { MissingIcon } from "@/icons";',
    '       |          ^'
  ];

  const viteResult = lens.process(viteLog, 1);
  assert.equal(viteResult.errors.length, 1);
  assert.equal(viteResult.errors[0].file, 'src/components/Header.tsx');
  assert.equal(viteResult.errors[0].line, 14);
  assert.equal(viteResult.errors[0].column, 8);

  const webpackLog = [
    'ERROR in ./src/pages/index.js 22:10',
    'Module not found: Can\'t resolve \'../components/Button\' in \'/app/src/pages\''
  ];
  const webpackResult = lens.process(webpackLog, 1);
  assert.equal(webpackResult.errors.length, 1);
  assert.equal(webpackResult.errors[0].file, './src/pages/index.js');
  assert.equal(webpackResult.errors[0].line, 22);
  assert.ok(webpackResult.errors[0].message.includes('Module not found'));
});

test('GradleMavenLens: isolates Maven compiler diagnostics and Gradle task failures', () => {
  const lens = new GradleMavenLens();
  assert.equal(lens.canHandle('./gradlew test', []), true);
  assert.equal(lens.canHandle('mvn clean test', []), true);

  const mavenLog = [
    '[INFO] Scanning for projects...',
    '[INFO] Compiling 15 source files to /target/classes',
    '[ERROR] /src/main/java/com/example/UserService.java:[45,18] error: cannot find symbol',
    '[ERROR]   symbol:   class PasswordEncoder',
    '[ERROR]   location: class com.example.UserService',
    '[INFO] BUILD FAILURE'
  ];

  const mavenResult = lens.process(mavenLog, 1);
  assert.equal(mavenResult.errors.length, 1);
  assert.equal(mavenResult.errors[0].file, '/src/main/java/com/example/UserService.java');
  assert.equal(mavenResult.errors[0].line, 45);
  assert.equal(mavenResult.errors[0].column, 18);
  assert.ok(mavenResult.errors[0].message.includes('cannot find symbol'));

  const gradleTestLog = [
    '> Task :compileJava UP-TO-DATE',
    '> Task :test',
    'com.example.OrderTest > testOrderTotal FAILED',
    '    org.opentest4j.AssertionFailedError: expected: <100.0> but was: <80.0>',
    '> Task :test FAILED',
    'BUILD FAILED in 4s'
  ];

  const gradleResult = lens.process(gradleTestLog, 1);
  assert.equal(gradleResult.errors.length, 1);
  assert.equal(gradleResult.errors[0].expected, '100.0');
  assert.equal(gradleResult.errors[0].received, '80.0');
  assert.ok(gradleResult.highlights.some(h => h.includes(':test')));
});

test('Ecosystem Lenses: accurately parse Windows drive letters and paths with spaces', () => {
  // 1. NodeTestLens with Windows path containing drive letter and spaces
  const nodeLens = new NodeTestLens();
  const nodeLog = [
    'TAP version 13',
    'not ok 1 - failing subtest',
    '  ---',
    '  error: "boom"',
    '  code: "ERR_ASSERTION"',
    '  stack: |- ',
    '    TestContext.<anonymous> (D:\\git hub auto\\sample.test.js:42:10)',
    '  ...'
  ];
  const nodeRes = nodeLens.process(nodeLog, 1);
  assert.equal(nodeRes.errors.length, 1);
  assert.equal(nodeRes.errors[0].file, 'D:\\git hub auto\\sample.test.js');
  assert.equal(nodeRes.errors[0].line, 42);
  assert.equal(nodeRes.errors[0].column, 10);

  // 2. GradleMavenLens with Windows path containing drive letter and spaces
  const mavenLens = new GradleMavenLens();
  const mavenLog = [
    '[ERROR] C:\\My Projects\\src\\Main.java:[42,15] error: cannot find symbol'
  ];
  const mavenRes = mavenLens.process(mavenLog, 1);
  assert.equal(mavenRes.errors.length, 1);
  assert.equal(mavenRes.errors[0].file, 'C:\\My Projects\\src\\Main.java');
  assert.equal(mavenRes.errors[0].line, 42);
  assert.equal(mavenRes.errors[0].column, 15);

  // 3. BundlerLens with Windows path containing drive letter and spaces
  const bundlerLens = new BundlerLens();
  const viteLog = [
    '[vite] Internal server error: Failed to parse source',
    '  File: C:\\My Projects\\src\\App.tsx:10:5'
  ];
  const bundlerRes = bundlerLens.process(viteLog, 1);
  assert.equal(bundlerRes.errors.length, 1);
  assert.equal(bundlerRes.errors[0].file, 'C:\\My Projects\\src\\App.tsx');
  assert.equal(bundlerRes.errors[0].line, 10);
  assert.equal(bundlerRes.errors[0].column, 5);
});
