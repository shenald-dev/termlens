import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class TscLens implements SemanticLens {
  readonly name = 'tsc';
  readonly description = 'Semantic lens for TypeScript Compiler (tsc)';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('tsc') || cmd.includes('typecheck')) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return /:\s+error\s+TS\d+:/.test(sample);
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0 && lines.length === 0) {
      return {
        summary: 'TypeScript compilation passed with 0 errors',
        errors: [],
        highlights: ['✓ Zero type errors']
      };
    }

    const errors: ErrorDetail[] = [];
    const filesWithErrors = new Set<string>();

    // Regex for standard tsc output:
    // src/server/routes.ts(45,12): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
    const tscRegex = /^([^(]+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

    for (const line of lines) {
      const match = line.match(tscRegex);
      if (match) {
        const file = match[1].trim();
        const lineNum = parseInt(match[2], 10);
        const colNum = parseInt(match[3], 10);
        const code = match[4];
        const message = match[5].trim();

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
        message: lines.slice(0, 3).join('\n') || 'TypeScript compilation failed'
      });
    }

    return {
      summary: `${errors.length} TypeScript error${errors.length === 1 ? '' : 's'} across ${filesWithErrors.size} file${filesWithErrors.size === 1 ? '' : 's'}`,
      errors,
      highlights: Array.from(filesWithErrors).map(f => `File: ${f}`)
    };
  }
}
