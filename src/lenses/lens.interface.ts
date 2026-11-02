import { LensProcessResult } from '../types.js';

export interface SemanticLens {
  readonly name: string;
  readonly description: string;

  /**
   * Evaluates whether this lens should handle the command based on command text
   * or the early stream signature.
   */
  canHandle(command: string, sampleLines: string[]): boolean;

  /**
   * Processes the normalized raw lines, isolating actionable failures and stripping noise.
   */
  process(lines: string[], exitCode: number): LensProcessResult;
}
