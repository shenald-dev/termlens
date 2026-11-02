import { TermlensExecutionResult } from '../types.js';

/**
 * Formats output specifically for AI coding agents and LLM prompts.
 * Ultra-compact, structured Markdown (<100 tokens typically).
 */
export function formatAgent(result: TermlensExecutionResult): string {
  const parts: string[] = [];

  const statusHeader = result.status === 'success'
    ? `### ✓ Command Passed: \`${result.command}\``
    : `### ✗ Command Failed (exit ${result.exitCode}): \`${result.command}\``;

  parts.push(statusHeader);
  parts.push(`- **Lens**: ${result.lensUsed}`);
  parts.push(`- **Summary**: ${result.summary}`);

  if (result.errors.length > 0) {
    parts.push('\n**Isolated Failures:**');
    result.errors.forEach((err, idx) => {
      const loc = err.file ? `\`${err.file}${err.line ? `:${err.line}` : ''}${err.column ? `:${err.column}` : ''}\`` : 'General';
      const codeStr = err.code ? ` [${err.code}]` : '';
      parts.push(`${idx + 1}. **${loc}**${codeStr}: ${err.message}`);

      if (err.expected || err.received) {
        if (err.expected) parts.push(`   - Expected: \`${err.expected}\``);
        if (err.received) parts.push(`   - Received: \`${err.received}\``);
      }

      if (err.snippet) {
        parts.push('   ```');
        parts.push(`   ${err.snippet.split('\n').slice(0, 3).join('\n   ')}`);
        parts.push('   ```');
      }
    });
  }

  if (result.suggestedAction) {
    parts.push(`\n**Action Item**: ${result.suggestedAction}`);
  }

  // Token compaction footnote
  parts.push(`\n*(termlens reduced ${result.rawLineCount} lines to ${result.compactLineCount} lines: -${result.tokenSavingsPct.toFixed(1)}% tokens)*`);

  return parts.join('\n');
}

/**
 * Formats output as raw JSON string.
 */
export function formatJson(result: TermlensExecutionResult): string {
  return JSON.stringify({
    command: result.command,
    exitCode: result.exitCode,
    status: result.status,
    lensUsed: result.lensUsed,
    durationMs: result.durationMs,
    tokenSavingsPct: Number(result.tokenSavingsPct.toFixed(1)),
    rawLines: result.rawLineCount,
    compactLines: result.compactLineCount,
    summary: result.summary,
    errors: result.errors,
    suggestedAction: result.suggestedAction,
    highlights: result.highlights
  }, null, 2);
}
