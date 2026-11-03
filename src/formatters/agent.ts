import { TermlensExecutionResult } from '../types.js';

/**
 * Formats output specifically for AI coding agents and LLM prompts.
 * Ultra-compact, structured Markdown (<100 tokens typically).
 */
export function formatAgent(result: TermlensExecutionResult, quietSuccess: boolean = false): string {
  // If command succeeded and quietSuccess is enabled, return minimal zero-overhead signal
  if (result.status === 'success') {
    if (quietSuccess) {
      return `✓ \`${result.command}\` passed`;
    }
    const lines: string[] = [
      `### ✓ Command Passed: \`${result.command}\``,
      `- **Lens**: ${result.lensUsed}`,
      `- **Summary**: ${result.summary}`
    ];
    if (result.highlights.length > 0) {
      lines.push(`- **Status**: ${result.highlights.join('; ')}`);
    }
    lines.push(`\n*(termlens reduced ${result.rawLineCount} lines to ${result.compactLineCount} lines: -${result.tokenSavingsPct.toFixed(1)}% tokens)*`);
    return lines.join('\n');
  }

  const parts: string[] = [];

  const statusHeader = `### ✗ Command Failed (exit ${result.exitCode}): \`${result.command}\``;
  parts.push(statusHeader);
  parts.push(`- **Lens**: ${result.lensUsed}`);
  parts.push(`- **Summary**: ${result.summary}`);

  // Use clusters if available, else standard errors
  if (result.clusters && result.clusters.length > 0) {
    parts.push('\n**Isolated Failures:**');
    result.clusters.forEach((cluster, idx) => {
      const err = cluster.exemplar;
      const primaryLoc = err.file ? `\`${err.file}${err.line ? `:${err.line}` : ''}${err.column ? `:${err.column}` : ''}\`` : 'General';
      const codeStr = err.code ? ` [${err.code}]` : '';

      if (cluster.isClustered) {
        parts.push(`${idx + 1}. **${primaryLoc}**${codeStr} *(occurred in ${cluster.occurrences} places)*: ${err.message}`);
        const otherLocs = cluster.locations.slice(1, 5).map(l => `\`${l.file}:${l.line}\``).join(', ');
        const remaining = cluster.locations.length > 5 ? ` (+${cluster.locations.length - 5} more)` : '';
        if (otherLocs) {
          parts.push(`   - Also in: ${otherLocs}${remaining}`);
        }
      } else {
        parts.push(`${idx + 1}. **${primaryLoc}**${codeStr}: ${err.message}`);
      }

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
  } else if (result.errors.length > 0) {
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

  // Token compaction footnote with estimated cost savings
  const costStr = result.estimatedCostSavingsUsd > 0 ? ` (~$${result.estimatedCostSavingsUsd.toFixed(4)} saved)` : '';
  parts.push(`\n*(termlens reduced ${result.rawLineCount} lines to ${result.compactLineCount} lines: -${result.tokenSavingsPct.toFixed(1)}% tokens${costStr})*`);

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
    rawEstimatedTokens: result.rawEstimatedTokens,
    compactEstimatedTokens: result.compactEstimatedTokens,
    estimatedCostSavingsUsd: result.estimatedCostSavingsUsd,
    rawLines: result.rawLineCount,
    compactLines: result.compactLineCount,
    summary: result.summary,
    errors: result.errors,
    clusters: result.clusters,
    suggestedAction: result.suggestedAction,
    highlights: result.highlights
  }, null, 2);
}
