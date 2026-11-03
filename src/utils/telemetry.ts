import { estimateTokens } from './ansi.js';

export interface TelemetryMetrics {
  rawLines: number;
  compactLines: number;
  rawEstimatedTokens: number;
  compactEstimatedTokens: number;
  tokensSaved: number;
  tokenSavingsPct: number;
  estimatedCostSavingsUsd: number;
}

// Blended average input token price across Claude 3.5 Sonnet / GPT-4o: $3.00 per 1,000,000 tokens
const COST_PER_TOKEN_USD = 0.000003;

export function calculateTelemetry(
  rawLinesCount: number,
  compactLinesCount: number,
  rawTextOrTokens: string | number,
  compactTextOrTokens: string | number
): TelemetryMetrics {
  const rawTokens = typeof rawTextOrTokens === 'number' ? rawTextOrTokens : estimateTokens(rawTextOrTokens);
  const compactTokens = typeof compactTextOrTokens === 'number' ? compactTextOrTokens : estimateTokens(compactTextOrTokens);

  const tokensSaved = Math.max(0, rawTokens - compactTokens);
  const tokenSavingsPct = rawTokens > 0
    ? Math.max(0, Math.min(99.9, (tokensSaved / rawTokens) * 100))
    : 0;

  const estimatedCostSavingsUsd = tokensSaved * COST_PER_TOKEN_USD;

  return {
    rawLines: Math.max(1, rawLinesCount),
    compactLines: Math.max(0, compactLinesCount),
    rawEstimatedTokens: rawTokens,
    compactEstimatedTokens: compactTokens,
    tokensSaved,
    tokenSavingsPct: Number(tokenSavingsPct.toFixed(1)),
    estimatedCostSavingsUsd: Number(estimatedCostSavingsUsd.toFixed(4))
  };
}
