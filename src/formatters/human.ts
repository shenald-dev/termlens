import pc from 'picocolors';
import { TermlensExecutionResult } from '../types.js';

export function formatHuman(result: TermlensExecutionResult): string {
  const lines: string[] = [];
  const divider = pc.dim('─'.repeat(64));

  // Top header banner
  const lensBadge = pc.cyan(`[lens: ${result.lensUsed}]`);
  const header = `${pc.bold(pc.cyan('🔍 termlens'))} ${pc.dim(`v0.1.0`)} ${lensBadge}`;
  lines.push(header);
  lines.push(divider);

  // Status & Command header
  const isPass = result.status === 'success';
  const statusBadge = isPass 
    ? pc.bold(pc.green('✓ PASSED')) 
    : pc.bold(pc.red(`✗ FAILED (exit ${result.exitCode})`));
  
  lines.push(`${statusBadge} ${pc.bold(pc.white(result.command))}`);

  if (isPass) {
    lines.push(`  ${pc.green(result.summary)}`);
    if (result.highlights.length > 0) {
      for (const h of result.highlights) {
        lines.push(`  ${pc.dim(h)}`);
      }
    }
  } else {
    lines.push(pc.yellow(`  ${result.summary}`));
    lines.push('');

    // Error details
    if (result.errors.length > 0) {
      result.errors.forEach((err, idx) => {
        const indexStr = pc.bold(pc.red(`[#${idx + 1}]`));
        if (err.file) {
          const loc = err.line ? `:${err.line}${err.column ? `:${err.column}` : ''}` : '';
          lines.push(`  ${indexStr} ${pc.bold(pc.underline(pc.cyan(err.file + loc)))}`);
        } else {
          lines.push(`  ${indexStr} ${pc.bold(pc.red('Error'))}`);
        }

        if (err.code) {
          lines.push(`      ${pc.dim('Code:')} ${pc.yellow(err.code)}`);
        }

        lines.push(`      ${pc.bold(err.message)}`);

        if (err.expected || err.received) {
          if (err.expected) lines.push(`      ${pc.green('Expected:')} ${err.expected}`);
          if (err.received) lines.push(`      ${pc.red('Received:')} ${err.received}`);
        }

        if (err.snippet) {
          lines.push(`      ${pc.dim('Code:')}`);
          const snippetLines = err.snippet.split('\n');
          for (const s of snippetLines.slice(0, 5)) {
            lines.push(`        ${pc.dim(s)}`);
          }
        }
        lines.push('');
      });
    }

    if (result.suggestedAction) {
      lines.push(`  💡 ${pc.bold(pc.cyan('Suggested action:'))} ${result.suggestedAction}`);
      lines.push('');
    }
  }

  // Raw tail if provided and not passing
  if (!isPass && result.rawTail.length > 0) {
    lines.push(pc.dim('  [Raw Tail Output]'));
    for (const t of result.rawTail.slice(-5)) {
      lines.push(`  ${pc.dim('│')} ${pc.dim(t)}`);
    }
    lines.push('');
  }

  // Bottom telemetry bar
  lines.push(divider);
  const savingsText = `(${result.tokenSavingsPct.toFixed(1)}% token savings)`;
  const styledSavings = result.tokenSavingsPct > 50 
    ? pc.bold(pc.green(savingsText)) 
    : pc.yellow(savingsText);

  const metrics = [
    `⏱️  ${result.durationMs}ms`,
    `📉 ${result.rawLineCount} lines → ${result.compactLineCount} lines`,
    styledSavings,
    pc.dim(`[Tokens: ~${result.rawEstimatedTokens} → ~${result.compactEstimatedTokens}]`)
  ].join('  │  ');

  lines.push(metrics);

  return lines.join('\n');
}
