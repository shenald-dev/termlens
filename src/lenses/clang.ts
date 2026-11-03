import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class ClangLens implements SemanticLens {
  readonly name = 'clang';
  readonly description = 'Semantic lens for C/C++ compilers (Clang, GCC, Make, CMake)';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (
      cmd.includes('gcc') ||
      cmd.includes('g++') ||
      cmd.includes('clang') ||
      cmd.includes('clang++') ||
      cmd.includes('make') ||
      cmd.includes('cmake')
    ) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return /:\d+:\d+:\s+(?:fatal\s+)?error:/.test(sample);
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0) {
      return {
        summary: 'C/C++ compilation succeeded with zero errors',
        errors: [],
        highlights: ['✓ Zero compile errors']
      };
    }

    const errors: ErrorDetail[] = [];
    const filesWithErrors = new Set<string>();

    // Regex for standard Clang/GCC error:
    // src/main.cpp:42:15: error: expected ';' at end of declaration
    // include/header.h:10:5: fatal error: 'openssl/ssl.h' file not found
    const gccRegex = /^([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+):(\d+):\s+(?:fatal\s+)?(error|warning):\s+(.*)$/;

    let currentError: Partial<ErrorDetail> | null = null;
    const snippetLines: string[] = [];

    for (const line of lines) {
      const match = line.match(gccRegex);
      if (match) {
        if (currentError && currentError.message) {
          if (snippetLines.length > 0) currentError.snippet = snippetLines.join('\n');
          errors.push(currentError as ErrorDetail);
          snippetLines.length = 0;
        }

        const file = match[1].trim();
        const lineNum = parseInt(match[2], 10);
        const colNum = parseInt(match[3], 10);
        const severity = match[4];
        const message = match[5].trim();

        filesWithErrors.add(file);
        currentError = {
          file,
          line: lineNum,
          column: colNum,
          code: severity.toUpperCase(),
          message
        };
        continue;
      }

      // Code pointer line (e.g. "   42 |   int x = 10" or "      |             ^")
      if (currentError && /^\s*\d+\s*\|\s*/.test(line) || /^\s*\|\s*\^/.test(line)) {
        snippetLines.push(line);
      }
    }

    if (currentError && currentError.message) {
      if (snippetLines.length > 0) currentError.snippet = snippetLines.join('\n');
      errors.push(currentError as ErrorDetail);
    }

    if (errors.length === 0 && exitCode !== 0) {
      errors.push({
        message: lines.slice(0, 3).join('\n') || 'C/C++ build failed'
      });
    }

    return {
      summary: `${errors.length} C/C++ compilation error${errors.length === 1 ? '' : 's'} across ${filesWithErrors.size} file${filesWithErrors.size === 1 ? '' : 's'}`,
      errors,
      highlights: Array.from(filesWithErrors).map(f => `File: ${f}`)
    };
  }
}
