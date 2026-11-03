import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class GolangLens implements SemanticLens {
  readonly name = 'go';
  readonly description = 'Semantic lens for Go toolchain (go test, go build, go vet)';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('go test') || cmd.includes('go build') || cmd.includes('go vet') || cmd.includes('go run')) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return sample.includes('--- FAIL:') || sample.includes('FAIL\t') || sample.includes('panic: runtime error') || /\.[a-z0-9_]+\.go:\d+:\d+:/.test(sample);
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0) {
      const passLine = lines.find(l => l.includes('PASS') || l.includes('ok\t'));
      return {
        summary: passLine ? passLine.trim() : 'Go tests and build passed successfully',
        errors: [],
        highlights: ['✓ Go execution passed with zero errors']
      };
    }

    const errors: ErrorDetail[] = [];
    const highlights: string[] = [];

    // Mode 1: Go Compile Errors (e.g. "./main.go:14:2: undefined: User")
    const compileRegex = /^([a-zA-Z0-9_\-./\\]+\.go):(\d+):(\d+):\s+(.*)$/;

    // Mode 2: Test failures
    let currentTestName: string | null = null;
    let currentTestFile: string | null = null;
    let currentTestLine: number | undefined;
    const testFailureMessages: string[] = [];

    // Mode 3: Panic detection
    let inPanic = false;
    let panicMessage: string | null = null;
    let panicLocation: { file?: string; line?: number } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check compile errors first
      const compileMatch = line.match(compileRegex);
      if (compileMatch) {
        errors.push({
          file: compileMatch[1].trim(),
          line: parseInt(compileMatch[2], 10),
          column: parseInt(compileMatch[3], 10),
          message: compileMatch[4].trim()
        });
        continue;
      }

      // Check panic
      if (line.startsWith('panic:')) {
        inPanic = true;
        panicMessage = line.trim();
        highlights.push(panicMessage);
        continue;
      }

      if (inPanic && !panicLocation) {
        // e.g. "\t/app/server.go:45 +0x1a"
        const panicLocMatch = line.match(/^\s*([a-zA-Z0-9_\-./\\]+\.go):(\d+)/);
        if (panicLocMatch && !panicLocMatch[1].includes('runtime/')) {
          panicLocation = {
            file: panicLocMatch[1].trim(),
            line: parseInt(panicLocMatch[2], 10)
          };
        }
      }

      // Check test run start: e.g. "=== RUN   TestUserAuthentication"
      const runMatch = line.match(/^===\s+RUN\s+([A-Za-z0-9_/]+)/);
      if (runMatch) {
        currentTestName = runMatch[1];
        continue;
      }

      // Check test assertion line inside a failing test:
      // e.g. "    auth_test.go:45: status mismatch: expected 401, got 200"
      const assertMatch = line.match(/^\s*([a-zA-Z0-9_\-./\\]+\.go):(\d+):\s+(.*)$/);
      if (assertMatch) {
        if (!currentTestFile) {
          currentTestFile = assertMatch[1].trim();
          currentTestLine = parseInt(assertMatch[2], 10);
        }
        testFailureMessages.push(assertMatch[3].trim());
        continue;
      }

      // Check test failures: e.g. "--- FAIL: TestUserAuthentication (0.02s)"
      const failHeader = line.match(/^---\s+FAIL:\s+([A-Za-z0-9_/]+)\s+\((.+)\)/);
      if (failHeader) {
        const testName = failHeader[1];
        errors.push({
          file: currentTestFile || undefined,
          line: currentTestLine,
          message: `${testName}: ${testFailureMessages.length > 0 ? testFailureMessages.join(' | ') : 'Test failed'}`
        });
        currentTestName = null;
        currentTestFile = null;
        currentTestLine = undefined;
        testFailureMessages.length = 0;
        highlights.push(`Failed test: ${testName}`);
        continue;
      }
    }

    if (currentTestName && testFailureMessages.length > 0) {
      errors.push({
        file: currentTestFile || undefined,
        line: currentTestLine,
        message: `${currentTestName}: ${testFailureMessages.join(' | ')}`
      });
    }

    if (inPanic && panicMessage) {
      errors.unshift({
        file: panicLocation?.file,
        line: panicLocation?.line,
        message: panicMessage
      });
    }

    if (errors.length === 0) {
      // Fallback to error lines
      const failLines = lines.filter(l => l.includes('FAIL') || l.includes('error:'));
      errors.push({
        message: failLines.slice(0, 3).join('\n') || `Go command failed with exit code ${exitCode}`
      });
    }

    return {
      summary: errors.length === 1 ? errors[0].message : `${errors.length} Go error${errors.length === 1 ? '' : 's'} isolated`,
      errors,
      highlights
    };
  }
}
