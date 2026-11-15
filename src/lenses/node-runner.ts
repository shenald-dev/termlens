import { SemanticLens } from './lens.interface.js';
import { LensProcessResult, ErrorDetail } from '../types.js';

export class NodeTestLens implements SemanticLens {
  public readonly name = 'node-test';
  public readonly description = 'Node.js built-in test runner (node --test / TAP) diagnostics and assertion failures';

  public canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('node --test') || cmd.includes('node -t') || cmd.includes('node:test')) {
      return true;
    }

    return sampleLines.some(line =>
      line.startsWith('TAP version') ||
      line.includes('# Subtest:') ||
      line.match(/^(?:not )?ok \d+ - /)
    );
  }

  public process(lines: string[], exitCode: number): LensProcessResult {
    const errors: ErrorDetail[] = [];
    const highlights: string[] = [];

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    // Scan for summary counts
    for (const line of lines) {
      const trimmed = line.trim();
      const testMatch = trimmed.match(/^# tests (\d+)/);
      if (testMatch) totalTests = parseInt(testMatch[1], 10);

      const passMatch = trimmed.match(/^# pass (\d+)/);
      if (passMatch) passedTests = parseInt(passMatch[1], 10);

      const failMatch = trimmed.match(/^# fail (\d+)/);
      if (failMatch) failedTests = parseInt(failMatch[1], 10);
    }

    if (totalTests > 0) {
      highlights.push(`${passedTests}/${totalTests} tests passed, ${failedTests} failed`);
    }

    // Parse failures
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const notOkMatch = line.match(/^not ok \d+ - (.+)$/);

      if (notOkMatch) {
        const testName = notOkMatch[1].trim();
        let errorMsg = testName;
        let failureCode: string | undefined;
        let expectedVal: string | undefined;
        let receivedVal: string | undefined;
        let stackFrame: string | undefined;
        let file: string | undefined;
        let lineNum: number | undefined;
        let colNum: number | undefined;

        i++;
        while (i < lines.length) {
          const subLine = lines[i];
          const trimmed = subLine.trim();

          if (trimmed === '...' || subLine.match(/^(?:not )?ok \d+ - /)) {
            break;
          }

          if (trimmed.startsWith("error: '")) {
            errorMsg = trimmed.slice(8, -1).trim();
          } else if (trimmed.startsWith('error: ')) {
            errorMsg = trimmed.slice(7).trim();
          }

          if (trimmed.startsWith('code: ')) {
            failureCode = trimmed.slice(6).replace(/['"]/g, '').trim();
          }

          if (trimmed.startsWith('expected: ')) {
            expectedVal = trimmed.slice(10).replace(/['"]/g, '').trim();
          }

          if (trimmed.startsWith('actual: ')) {
            receivedVal = trimmed.slice(8).replace(/['"]/g, '').trim();
          }

          // Locate stack frame: e.g. at TestContext.<anonymous> (file:line:col) or at file:line:col
          const locMatch = subLine.match(/(?:at\s+.*?\s+\(?|\()([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+):(\d+):(\d+)\)?/);
          if (locMatch && !file) {
            file = locMatch[1];
            lineNum = parseInt(locMatch[2], 10);
            colNum = parseInt(locMatch[3], 10);
            stackFrame = subLine.trim();
          }

          i++;
        }

        errors.push({
          file,
          line: lineNum,
          column: colNum,
          code: failureCode,
          message: errorMsg,
          expected: expectedVal,
          received: receivedVal,
          snippet: stackFrame
        });
      } else {
        i++;
      }
    }

    if (errors.length === 0 && exitCode !== 0) {
      return {
        summary: 'Command exited with failure, but no specific TAP test failures were isolated.',
        errors: [{ message: 'Command failed with exit code ' + exitCode }],
        highlights
      };
    }

    const summary = exitCode === 0
      ? `All ${passedTests || totalTests || 'test'} subtests passed successfully.`
      : `${errors.length} test failure${errors.length === 1 ? '' : 's'} isolated across test run.`;

    return {
      summary,
      errors,
      highlights,
      suggestedAction: errors.length > 0 ? 'Fix the isolated failing assertions in the cited test suites.' : undefined
    };
  }
}
