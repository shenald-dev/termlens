import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class JestVitestLens implements SemanticLens {
  readonly name = 'jest';
  readonly description = 'Semantic lens for Jest & Vitest test runners';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('jest') || cmd.includes('vitest') || cmd.includes('test')) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return sample.includes('PASS ') || sample.includes('FAIL ') || sample.includes('Test Suites:');
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    const errors: ErrorDetail[] = [];
    const highlights: string[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let totalCount = 0;

    // Scan for counts (e.g. Tests: 1 failed, 42 passed, 43 total)
    for (const line of lines) {
      const testsMatch = line.match(/Tests:\s+(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(\d+)\s+total/i);
      if (testsMatch) {
        failedCount = parseInt(testsMatch[1] || '0', 10);
        passedCount = parseInt(testsMatch[2] || '0', 10);
        totalCount = parseInt(testsMatch[3] || '0', 10);
      }
    }

    if (exitCode === 0) {
      const summaryMsg = totalCount > 0
        ? `All ${totalCount} test${totalCount === 1 ? '' : 's'} passed successfully`
        : 'All tests passed successfully';
      return {
        summary: summaryMsg,
        errors: [],
        highlights: [`✓ ${passedCount || totalCount} tests passed`]
      };
    }

    // Extract failures
    let inFailureBlock = false;
    let currentError: Partial<ErrorDetail> | null = null;
    const snippetLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // New test failure header: e.g. "FAIL src/auth/jwt.test.ts"
      if (line.startsWith('FAIL ') || line.includes(' FAIL ')) {
        const filePath = line.replace(/.*FAIL\s+/, '').trim();
        highlights.push(`Failed file: ${filePath}`);
        continue;
      }

      // Test case failure: "  ● TestSuite › should authenticate user" or "⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯"
      if (line.includes('● ') || line.includes('⎯ Failed Tests')) {
        if (currentError && currentError.message) {
          if (snippetLines.length > 0) {
            currentError.snippet = snippetLines.join('\n');
          }
          errors.push(currentError as ErrorDetail);
          snippetLines.length = 0;
        }

        const title = line.replace(/^[●\s⎯\d]+/, '').trim();
        currentError = {
          message: title || 'Test assertion failure'
        };
        inFailureBlock = true;
        continue;
      }

      if (inFailureBlock && currentError) {
        // Stack trace line with file, line, col
        // e.g. "    at Object.<anonymous> (src/auth/jwt.test.ts:42:15)"
        // or " ❯ src/auth/jwt.test.ts:42:15"
        const stackMatch = line.match(/(?:at |❯\s+)(?:[^(]*\(([^:]+):(\d+):(\d+)\)|([^:]+):(\d+):(\d+))/);
        if (stackMatch) {
          const file = stackMatch[1] || stackMatch[4];
          const lineNum = parseInt(stackMatch[2] || stackMatch[5], 10);
          const colNum = parseInt(stackMatch[3] || stackMatch[6], 10);

          if (!currentError.file && file && !file.includes('node_modules')) {
            currentError.file = file.trim();
            currentError.line = lineNum;
            currentError.column = colNum;
          }
        }

        // Expected vs Received
        if (line.includes('Expected:')) {
          currentError.expected = line.replace(/.*Expected:\s*/, '').trim();
        } else if (line.includes('Received:')) {
          currentError.received = line.replace(/.*Received:\s*/, '').trim();
        } else if (line.includes('Error:') || line.includes('AssertionError:')) {
          currentError.message = line.trim();
        }

        // Code snippet around failure (e.g. lines starting with "> 42 |")
        if (/^\s*>\s*\d+\s*\|/.test(line) || /^\s*\d+\s*\|/.test(line)) {
          snippetLines.push(line.trim());
        }
      }
    }

    if (currentError && (currentError.message || currentError.file)) {
      if (snippetLines.length > 0) {
        currentError.snippet = snippetLines.join('\n');
      }
      errors.push(currentError as ErrorDetail);
    }

    // Fallback if structured parsing missed specific block
    if (errors.length === 0 && exitCode !== 0) {
      const failureLines = lines.filter(l => 
        l.includes('FAIL') || l.includes('Error:') || l.includes('Expected') || l.includes('Received')
      );
      errors.push({
        message: failureLines.slice(0, 3).join(' ') || 'Test suite exited with non-zero status',
        snippet: failureLines.slice(0, 5).join('\n')
      });
    }

    const errorCount = errors.length || failedCount || 1;
    return {
      summary: `${errorCount} test failure${errorCount === 1 ? '' : 's'} isolated`,
      errors,
      highlights
    };
  }
}
