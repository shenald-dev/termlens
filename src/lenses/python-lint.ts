import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class PythonLintLens implements SemanticLens {
  readonly name = 'python-lint';
  readonly description = 'Semantic lens for Python linters & typecheckers (Ruff, Mypy, Flake8)';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('ruff') || cmd.includes('mypy') || cmd.includes('flake8') || cmd.includes('pylint')) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return /:\d+:\d+:\s+(?:[A-Z]\d+|error:)/.test(sample) || sample.includes('Found ') && sample.includes('error');
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0 && lines.length === 0) {
      return {
        summary: 'All Python lint and type checks passed with 0 errors',
        errors: [],
        highlights: ['✓ Zero linter or type errors']
      };
    }

    const errors: ErrorDetail[] = [];
    const filesWithErrors = new Set<string>();

    // Regex 1: Ruff / Flake8 format:
    // path/to/file.py:42:1: F401 'os' imported but unused
    // path/to/file.py:88:5: E501 line too long
    const ruffRegex = /^([a-zA-Z0-9_\-./\\]+\.py):(\d+):(\d+):\s+([A-Z]\d+)(?:\s+\[\*?\])?\s+(.*)$/;

    // Regex 2: Mypy format:
    // src/server.py:88: error: Incompatible return value type  [return-value]
    // src/server.py:88:12: error: Incompatible return value type  [return-value]
    const mypyRegex = /^([a-zA-Z0-9_\-./\\]+\.py):(\d+)(?::(\d+))?:\s+error:\s+(.*?)(?:\s+\[([a-z-]+)\])?$/;

    for (const line of lines) {
      const ruffMatch = line.match(ruffRegex);
      if (ruffMatch) {
        const file = ruffMatch[1].trim();
        const lineNum = parseInt(ruffMatch[2], 10);
        const colNum = parseInt(ruffMatch[3], 10);
        const code = ruffMatch[4];
        const message = ruffMatch[5].trim();

        filesWithErrors.add(file);
        errors.push({
          file,
          line: lineNum,
          column: colNum,
          code,
          message
        });
        continue;
      }

      const mypyMatch = line.match(mypyRegex);
      if (mypyMatch) {
        const file = mypyMatch[1].trim();
        const lineNum = parseInt(mypyMatch[2], 10);
        const colNum = mypyMatch[3] ? parseInt(mypyMatch[3], 10) : undefined;
        const message = mypyMatch[4].trim();
        const code = mypyMatch[5] || 'type-error';

        filesWithErrors.add(file);
        errors.push({
          file,
          line: lineNum,
          column: colNum,
          code,
          message
        });
      }
    }

    if (errors.length === 0 && exitCode !== 0) {
      errors.push({
        message: lines.slice(0, 3).join('\n') || 'Python linting failed'
      });
    }

    return {
      summary: `${errors.length} Python lint/type issue${errors.length === 1 ? '' : 's'} across ${filesWithErrors.size} file${filesWithErrors.size === 1 ? '' : 's'}`,
      errors,
      highlights: Array.from(filesWithErrors).map(f => `File: ${f}`)
    };
  }
}
