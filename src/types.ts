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
  summary: string;
  errors: ErrorDetail[];
  highlights: string[];
  suggestedAction?: string;
  rawTail: string[];
  humanFormatted: string;
  agentFormatted: string;
  jsonFormatted: string;
}

export interface TermlensOptions {
  agentMode?: boolean;
  jsonMode?: boolean;
  rawMode?: boolean;
  lens?: string;
  tailLines?: number;
  stats?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}
