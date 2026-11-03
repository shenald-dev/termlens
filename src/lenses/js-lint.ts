import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class JsLintLens implements SemanticLens {
  readonly name = 'js-lint';
  readonly description = 'Semantic lens for JavaScript/TypeScript linters (ESLint, Biome, Prettier)';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('eslint') || cmd.includes('biome') || cmd.includes('lint')) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return /^\s*\d+:\d+\s+(?:error|warning)\s+/m.test(sample) || sample.includes('✖') && sample.includes('problems');
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0 && lines.length === 0) {
      return {
        summary: 'Linting passed with 0 errors',
        errors: [],
        highlights: ['✓ Zero lint violations']
      };
    }

    const errors: ErrorDetail[] = [];
    const filesWithErrors = new Set<string>();

    let currentFile: string | null = null;

    // Pattern 1: ESLint file header: "/app/src/index.ts" or "src/App.tsx"
    // Pattern 2: ESLint error line: "  15:3  error  'x' is defined but never used  @typescript-eslint/no-unused-vars"
    const eslintErrorRegex = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.*?)(?:\s{2,}([a-zA-Z0-9_\-/@]+))?$/;

    // Pattern 3: Biome error line: "src/index.ts:15:3 lint/correctness/noUnusedVariables"
    const biomeRegex = /^([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+):(\d+)\s+([a-zA-Z0-9_\-/]+)/;

    for (const line of lines) {
      // Biome match
      const biomeMatch = line.match(biomeRegex);
      if (biomeMatch) {
        const file = biomeMatch[1].trim();
        const lineNum = parseInt(biomeMatch[2], 10);
        const colNum = parseInt(biomeMatch[3], 10);
        const code = biomeMatch[4];
        filesWithErrors.add(file);
        errors.push({
          file,
          line: lineNum,
          column: colNum,
          code,
          message: `Linter rule violation: ${code}`
        });
        continue;
      }

      // Check if line is a file path header in ESLint
      const trimmed = line.trim();
      if (
        (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('src/') || trimmed.startsWith('tests/')) &&
        /\.[jt]sx?$/.test(trimmed)
      ) {
        currentFile = trimmed;
        continue;
      }

      const match = line.match(eslintErrorRegex);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        const colNum = parseInt(match[2], 10);
        const severity = match[3];
        const message = match[4].trim();
        const code = match[5] || severity;

        if (currentFile) filesWithErrors.add(currentFile);
        errors.push({
          file: currentFile || undefined,
          line: lineNum,
          column: colNum,
          code,
          message
        });
      }
    }

    if (errors.length === 0 && exitCode !== 0) {
      errors.push({
        message: lines.slice(0, 3).join('\n') || 'Linter execution failed'
      });
    }

    return {
      summary: `${errors.length} lint violation${errors.length === 1 ? '' : 's'} across ${filesWithErrors.size} file${filesWithErrors.size === 1 ? '' : 's'}`,
      errors,
      highlights: Array.from(filesWithErrors).map(f => `File: ${f}`)
    };
  }
}
