import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class CargoLens implements SemanticLens {
  readonly name = 'cargo';
  readonly description = 'Semantic lens for Rust cargo toolchain';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('cargo ')) return true;
    const sample = sampleLines.join('\n');
    return sample.includes('error[E') || sample.includes('Compiling ') || sample.includes('Finished `dev` profile');
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0) {
      return {
        summary: 'Rust cargo build/test passed',
        errors: [],
        highlights: ['✓ Zero compile errors']
      };
    }

    const errors: ErrorDetail[] = [];
    let currentError: Partial<ErrorDetail> | null = null;
    const snippetLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // e.g. "error[E0308]: mismatched types"
      const errorHeader = line.match(/^error(?:\[(E\d+)\])?:\s+(.*)$/);
      if (errorHeader) {
        if (currentError && currentError.message) {
          if (snippetLines.length > 0) currentError.snippet = snippetLines.join('\n');
          errors.push(currentError as ErrorDetail);
          snippetLines.length = 0;
        }

        currentError = {
          code: errorHeader[1] || 'ERROR',
          message: errorHeader[2].trim()
        };
        continue;
      }

      // Location pointer: e.g. "  --> src/main.rs:12:9"
      const locMatch = line.match(/^\s*-->\s*([^:]+):(\d+):(\d+)/);
      if (locMatch && currentError) {
        currentError.file = locMatch[1].trim();
        currentError.line = parseInt(locMatch[2], 10);
        currentError.column = parseInt(locMatch[3], 10);
        continue;
      }

      // Snippet context line
      if (line.match(/^\s*\d+\s*\|/) || line.match(/^\s*\|\s*\^/)) {
        snippetLines.push(line);
      }
    }

    if (currentError && currentError.message) {
      if (snippetLines.length > 0) currentError.snippet = snippetLines.join('\n');
      errors.push(currentError as ErrorDetail);
    }

    if (errors.length === 0 && exitCode !== 0) {
      errors.push({
        message: lines.filter(l => l.includes('error')).slice(0, 3).join('\n') || 'Cargo execution failed'
      });
    }

    return {
      summary: `${errors.length} Rust compile error${errors.length === 1 ? '' : 's'}`,
      errors
    };
  }
}
