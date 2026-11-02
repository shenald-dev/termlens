import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class PytestLens implements SemanticLens {
  readonly name = 'pytest';
  readonly description = 'Semantic lens for Python pytest test runner';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('pytest') || (cmd.includes('python') && cmd.includes('test'))) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return sample.includes('test session starts') || sample.includes('=== FAILURES ===') || sample.includes('rootdir:');
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    const errors: ErrorDetail[] = [];
    const highlights: string[] = [];

    // Check pass status
    const passedMatch = lines.find(l => l.includes('passed') && l.includes('==='));
    if (exitCode === 0) {
      return {
        summary: passedMatch ? passedMatch.replace(/=/g, '').trim() : 'All pytest tests passed',
        errors: [],
        highlights: ['✓ Python test suite passed']
      };
    }

    let inFailures = false;
    let currentError: Partial<ErrorDetail> | null = null;
    const snippetLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes('=== FAILURES ===')) {
        inFailures = true;
        continue;
      }

      if (inFailures) {
        // e.g. "_________________________ test_token_expiration __________________________"
        const headerMatch = line.match(/^_{3,}\s*(.+?)\s*_{3,}$/);
        if (headerMatch) {
          if (currentError && currentError.message) {
            if (snippetLines.length > 0) currentError.snippet = snippetLines.join('\n');
            errors.push(currentError as ErrorDetail);
            snippetLines.length = 0;
          }
          currentError = {
            message: headerMatch[1].trim()
          };
          continue;
        }

        // File path and line: e.g. "tests/test_auth.py:48: in test_token_expiration"
        const fileMatch = line.match(/(?:^|\s*)([a-zA-Z0-9_\-./\\]+\.py):(\d+):/);
        if (fileMatch && currentError) {
          currentError.file = fileMatch[1].trim();
          currentError.line = parseInt(fileMatch[2], 10);
        }

        // Error line: lines starting with "E   "
        if (line.startsWith('E   ') && currentError) {
          const errMsg = line.replace(/^E\s+/, '').trim();
          if (!currentError.message || currentError.message.startsWith('test_')) {
            currentError.message = errMsg;
          } else {
            currentError.message += ` | ${errMsg}`;
          }
        }

        // Traceback code lines (indented code before E)
        if (line.startsWith('    ') && !line.startsWith('    at ')) {
          snippetLines.push(line.trim());
        }

        // Short test summary line: "FAILED tests/test_auth.py::test_token_expiration - AssertionError"
        if (line.startsWith('FAILED ')) {
          highlights.push(line.replace('FAILED ', '').trim());
        }
      }
    }

    if (currentError && (currentError.message || currentError.file)) {
      if (snippetLines.length > 0) currentError.snippet = snippetLines.join('\n');
      errors.push(currentError as ErrorDetail);
    }

    if (errors.length === 0 && exitCode !== 0) {
      const failSummary = lines.filter(l => l.startsWith('FAILED '));
      if (failSummary.length > 0) {
        for (const f of failSummary) {
          errors.push({ message: f.replace('FAILED ', '').trim() });
        }
      } else {
        errors.push({ message: 'Pytest failed with non-zero exit code' });
      }
    }

    return {
      summary: `${errors.length} pytest failure${errors.length === 1 ? '' : 's'} isolated`,
      errors,
      highlights
    };
  }
}
