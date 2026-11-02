import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class GenericLens implements SemanticLens {
  readonly name = 'generic';
  readonly description = 'Universal semantic error lens and noise compactor';

  canHandle(_command: string, _sampleLines: string[]): boolean {
    return true; // Always matches as fallback
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0) {
      // Find the last few informative lines
      const cleanLines = lines.filter(l => l.trim().length > 0);
      const lastLine = cleanLines[cleanLines.length - 1] || 'Command completed successfully';
      return {
        summary: lastLine,
        errors: [],
        highlights: ['✓ Process exited with code 0']
      };
    }

    const errors: ErrorDetail[] = [];
    const significantLines: string[] = [];

    // Scan for high-signal error lines
    const errorKeywords = [
      'error:', 'fatal:', 'failed:', 'exception:', 'cannot find',
      'eacces', 'econnrefused', 'enoent', 'eaddrinuse', 'command not found',
      'typeerror:', 'referenceerror:', 'syntaxerror:', 'traceback (most recent call last):'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      const hasKeyword = errorKeywords.some(kw => lower.includes(kw));
      if (hasKeyword) {
        significantLines.push(line);

        // Check if file:line:col pattern exists in this line or nearby
        const fileMatch = line.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?/);
        if (fileMatch) {
          errors.push({
            file: fileMatch[1],
            line: parseInt(fileMatch[2], 10),
            column: fileMatch[3] ? parseInt(fileMatch[3], 10) : undefined,
            message: line.trim()
          });
        }
      }
    }

    // If no specific file matched, use the significant error lines
    if (errors.length === 0) {
      if (significantLines.length > 0) {
        errors.push({
          message: significantLines.slice(0, 3).join('\n')
        });
      } else {
        // Fallback to the tail of the output (last 5 non-empty lines)
        const nonBlank = lines.filter(l => l.trim().length > 0);
        errors.push({
          message: nonBlank.slice(-5).join('\n') || `Process failed with exit code ${exitCode}`
        });
      }
    }

    return {
      summary: errors[0]?.message.split('\n')[0] || `Command exited with status ${exitCode}`,
      errors,
      highlights: significantLines.slice(0, 3)
    };
  }
}
