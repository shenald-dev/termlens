export interface ErrorDetail {
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  expected?: string;
  received?: string;
  snippet?: string;
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
}
