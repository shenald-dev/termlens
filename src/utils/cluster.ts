import { ErrorDetail, ErrorCluster } from '../types.js';

export interface ClusteredResult {
  clusters: ErrorCluster[];
  totalOriginal: number;
  deduplicatedCount: number;
  omittedCount: number;
}

/**
 * Normalizes an error message to a fingerprint for clustering.
 * Strips volatile parameters like numbers, memory addresses, object IDs, and quotes.
 */
function fingerprintMessage(msg: string): string {
  if (!msg) return '';
  return msg
    .toLowerCase()
    .replace(/0x[0-9a-fA-F]+/g, '0xHEX')
    .replace(/\b\d{4,}\b/g, 'NUM')
    .replace(/'[^']*'/g, "'VAR'")
    .replace(/"[^"]*"/g, '"VAR"')
    .replace(/`[^`]*`/g, '`VAR`')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clusters and deduplicates repetitive error details.
 * Prevents LLM context blowout when a cascading failure yields dozens of identical errors.
 */
export function clusterErrors(errors: ErrorDetail[], maxErrors: number = 8): ClusteredResult {
  const totalOriginal = errors.length;
  if (totalOriginal === 0) {
    return {
      clusters: [],
      totalOriginal: 0,
      deduplicatedCount: 0,
      omittedCount: 0
    };
  }

  const groups = new Map<string, { exemplar: ErrorDetail; locations: Array<{ file?: string; line?: number; column?: number }>; count: number }>();

  for (const err of errors) {
    const codePart = err.code ? `[${err.code}]` : '';
    const fp = `${codePart}:${fingerprintMessage(err.message)}`;

    const existing = groups.get(fp);
    const loc = { file: err.file, line: err.line, column: err.column };

    if (existing) {
      existing.count += 1;
      // Record location if not already recorded
      const alreadyHas = existing.locations.some(l => l.file === loc.file && l.line === loc.line);
      if (!alreadyHas) {
        existing.locations.push(loc);
      }
      // If the current error has a snippet or expected/received and existing does not, enhance exemplar
      if (!existing.exemplar.snippet && err.snippet) existing.exemplar.snippet = err.snippet;
      if (!existing.exemplar.expected && err.expected) existing.exemplar.expected = err.expected;
      if (!existing.exemplar.received && err.received) existing.exemplar.received = err.received;
    } else {
      groups.set(fp, {
        exemplar: { ...err },
        locations: [loc],
        count: 1
      });
    }
  }

  const allClusters: ErrorCluster[] = [];
  for (const group of groups.values()) {
    allClusters.push({
      exemplar: group.exemplar,
      occurrences: group.count,
      locations: group.locations,
      isClustered: group.count > 1
    });
  }

  // Sort clusters: high-occurrence clusters first, then by presence of file
  allClusters.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    if (a.exemplar.file && !b.exemplar.file) return -1;
    if (!a.exemplar.file && b.exemplar.file) return 1;
    return 0;
  });

  const cappedClusters = allClusters.slice(0, maxErrors);
  const omittedCount = Math.max(0, allClusters.length - maxErrors);
  const deduplicatedCount = allClusters.length;

  return {
    clusters: cappedClusters,
    totalOriginal,
    deduplicatedCount,
    omittedCount
  };
}
