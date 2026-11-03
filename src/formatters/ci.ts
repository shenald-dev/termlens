import { TermlensExecutionResult } from '../types.js';

/**
 * Formats isolated errors as GitHub Actions workflow commands (::error file=...::...).
 * Enables automated PR diff annotations in GitHub CI/CD workflows.
 */
export function formatCiAnnotations(result: TermlensExecutionResult): string {
  if (result.status === 'success' || result.errors.length === 0) {
    return `::notice title=termlens::${result.summary || 'Command passed successfully'}`;
  }

  const lines: string[] = [];

  for (const err of result.errors) {
    const params: string[] = [];
    if (err.file) params.push(`file=${err.file}`);
    if (err.line) params.push(`line=${err.line}`);
    if (err.column) params.push(`col=${err.column}`);
    if (err.code) params.push(`title=${err.code}`);

    const paramStr = params.length > 0 ? ` ${params.join(',')}` : '';
    // Clean newlines for single-line GitHub workflow command format
    const cleanMsg = err.message.replace(/[\r\n]+/g, ' ').trim();
    lines.push(`::error${paramStr}::${cleanMsg}`);
  }

  return lines.join('\n');
}
