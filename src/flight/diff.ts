import { FlightDiffResult, FlightRecord, ErrorCluster } from '../types.js';

function clusterKey(cluster: ErrorCluster): string {
  const ex = cluster.exemplar;
  const fileKey = ex.file ? ex.file.replace(/\\/g, '/') : 'any';
  const codeKey = ex.code || '';
  const msgKey = (ex.message || '')
    .toLowerCase()
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return `${fileKey}::${codeKey}::${msgKey}`;
}

export function diffFlights(base: FlightRecord, target: FlightRecord): FlightDiffResult {
  const baseMap = new Map<string, ErrorCluster>();
  const baseClusters = base.clusters || (base.errors || []).map(e => ({ exemplar: e, occurrences: 1, locations: [], isClustered: false }));
  for (const c of baseClusters) {
    baseMap.set(clusterKey(c), c);
  }

  const targetMap = new Map<string, ErrorCluster>();
  const targetClusters = target.clusters || (target.errors || []).map(e => ({ exemplar: e, occurrences: 1, locations: [], isClustered: false }));
  for (const c of targetClusters) {
    targetMap.set(clusterKey(c), c);
  }

  const resolvedErrors: ErrorCluster[] = [];
  const persistentErrors: ErrorCluster[] = [];
  const newErrors: ErrorCluster[] = [];

  for (const [key, cluster] of baseMap.entries()) {
    if (targetMap.has(key)) {
      persistentErrors.push(cluster);
    } else {
      resolvedErrors.push(cluster);
    }
  }

  for (const [key, cluster] of targetMap.entries()) {
    if (!baseMap.has(key)) {
      newErrors.push(cluster);
    }
  }

  const statusDelta = `${base.status} (exit ${base.exitCode}) ➔ ${target.status} (exit ${target.exitCode})`;

  const parts: string[] = [];
  parts.push(`### 🔍 Flight Delta: \`${base.id}\` ➔ \`${target.id}\``);
  parts.push(`- **Transition**: ${statusDelta}`);
  parts.push(`- **Command**: \`${target.command}\``);
  parts.push(`- **Overview**: -${resolvedErrors.length} resolved, +${newErrors.length} new, ${persistentErrors.length} persistent`);

  if (resolvedErrors.length > 0) {
    parts.push('\n**✓ Resolved Failures:**');
    resolvedErrors.forEach((c, idx) => {
      const loc = c.exemplar.file ? `\`${c.exemplar.file}${c.exemplar.line ? `:${c.exemplar.line}` : ''}\`` : 'General';
      const code = c.exemplar.code ? ` [${c.exemplar.code}]` : '';
      parts.push(`${idx + 1}. **${loc}**${code}: ${c.exemplar.message}`);
    });
  }

  if (newErrors.length > 0) {
    parts.push('\n**✗ New / Regressed Failures:**');
    newErrors.forEach((c, idx) => {
      const loc = c.exemplar.file ? `\`${c.exemplar.file}${c.exemplar.line ? `:${c.exemplar.line}` : ''}\`` : 'General';
      const code = c.exemplar.code ? ` [${c.exemplar.code}]` : '';
      parts.push(`${idx + 1}. **${loc}**${code}: ${c.exemplar.message}`);
    });
  }

  if (persistentErrors.length > 0) {
    parts.push('\n**⚠️ Persistent Failures:**');
    persistentErrors.forEach((c, idx) => {
      const loc = c.exemplar.file ? `\`${c.exemplar.file}${c.exemplar.line ? `:${c.exemplar.line}` : ''}\`` : 'General';
      const code = c.exemplar.code ? ` [${c.exemplar.code}]` : '';
      parts.push(`${idx + 1}. **${loc}**${code}: ${c.exemplar.message}`);
    });
  }

  const markdown = parts.join('\n');
  const summary = `${resolvedErrors.length} resolved, ${newErrors.length} new, ${persistentErrors.length} remaining`;

  return {
    baseFlightId: base.id,
    targetFlightId: target.id,
    baseCommand: base.command,
    targetCommand: target.command,
    statusDelta,
    resolvedCount: resolvedErrors.length,
    newCount: newErrors.length,
    persistentCount: persistentErrors.length,
    resolvedErrors,
    newErrors,
    persistentErrors,
    summary,
    markdown
  };
}
