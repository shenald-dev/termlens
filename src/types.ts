export interface SourceLine {
  lineNum: number;
  content: string;
  isTarget: boolean;
}

export interface SourceContext {
  file: string;
  line: number;
  column?: number;
  lines: SourceLine[];
  formattedSnippet: string;
}

export interface ErrorDetail {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  expected?: string;
  received?: string;
  snippet?: string;
  sourceContext?: SourceContext;
  category?: string;
  suggestedFix?: string;
}

export interface ErrorCluster {
  exemplar: ErrorDetail;
  occurrences: number;
  locations: Array<{ file?: string; line?: number; column?: number }>;
  isClustered: boolean;
}

export interface LensProcessResult {
  summary: string;
  errors: ErrorDetail[];
  highlights?: string[];
  suggestedAction?: string;
}

export interface RemediationPlan {
  category: string;
  confidence: 'high' | 'medium' | 'low';
  title: string;
  explanation: string;
  suggestedCommand?: string;
  patchHypothesis?: string;
}

export interface FlightTelemetry {
  rawLines: number;
  compactLines: number;
  rawEstimatedTokens: number;
  compactEstimatedTokens: number;
  tokensSaved: number;
  tokenSavingsPct: number;
  estimatedCostSavingsUsd: number;
}

export interface FlightRecord {
  id: string;
  timestamp: string;
  command: string;
  cwd: string;
  gitBranch?: string;
  gitCommit?: string;
  exitCode: number;
  durationMs: number;
  status: 'success' | 'failure' | 'timeout';
  lensUsed: string;
  summary: string;
  errorCount: number;
  clusterCount: number;
  clusters: ErrorCluster[];
  errors: ErrorDetail[];
  remediations: RemediationPlan[];
  telemetry: FlightTelemetry;
}

export interface FlightDiffResult {
  baseFlightId: string;
  targetFlightId: string;
  baseCommand: string;
  targetCommand: string;
  statusDelta: string;
  resolvedCount: number;
  newCount: number;
  persistentCount: number;
  resolvedErrors: ErrorCluster[];
  newErrors: ErrorCluster[];
  persistentErrors: ErrorCluster[];
  summary: string;
  markdown: string;
}

export interface TermlensExecutionResult {
  command: string;
  exitCode: number;
  durationMs: number;
  lensUsed: string;
  status: 'success' | 'failure' | 'timeout';
  rawLineCount: number;
  rawCharCount: number;
  compactLineCount: number;
  compactCharCount: number;
  tokenSavingsPct: number;
  rawEstimatedTokens: number;
  compactEstimatedTokens: number;
  estimatedCostSavingsUsd: number;
  summary: string;
  errors: ErrorDetail[];
  clusters: ErrorCluster[];
  highlights: string[];
  suggestedAction?: string;
  rawTail: string[];
  humanFormatted: string;
  agentFormatted: string;
  jsonFormatted: string;
  ciFormatted?: string;
  flightId?: string;
  remediations?: RemediationPlan[];
  flightDiff?: FlightDiffResult;
}

export interface TermlensOptions {
  agentMode?: boolean;
  jsonMode?: boolean;
  rawMode?: boolean;
  ciMode?: boolean;
  quietSuccess?: boolean;
  lens?: string;
  tailLines?: number;
  maxErrors?: number;
  noCluster?: boolean;
  outputFile?: string;
  stats?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  recordFlight?: boolean;
  flightDir?: string;
  diffWithFlightId?: string;
  diffWithLast?: boolean;
  enrichSource?: boolean;
  maxRawBytes?: number;
}
