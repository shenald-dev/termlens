/**
 * Regular expression to match all standard ANSI escape sequences:
 * - Color and style SGR codes (ESC [ ... m)
 * - Cursor navigation codes (ESC [ ... H, A, B, C, D, etc.)
 * - Screen clearing and erase codes (ESC [ ... J, K)
 * - OSC (Operating System Command) strings (ESC ] ... BEL/ST)
 * - Private mode escapes and control characters
 */
const ANSI_REGEX = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|'),
  'g'
);

/**
 * Strips all ANSI formatting codes from a string.
 */
export function stripAnsi(text: string): string {
  if (!text) return '';
  return text.replace(ANSI_REGEX, '');
}

/**
 * Normalizes multi-line text by cleaning carriage returns (\r from spinners)
 * and splitting into clean trimmed lines.
 */
export function normalizeLines(text: string): string[] {
  if (!text) return [];
  // Strip ANSI first
  const clean = stripAnsi(text);
  // Split on newline
  const rawLines = clean.split(/\r?\n/);
  const result: string[] = [];

  for (const line of rawLines) {
    // If a line contains carriage returns (common in progress bars/spinners),
    // only the last segment after \r is visible on terminal
    if (line.includes('\r')) {
      const parts = line.split('\r');
      const last = parts[parts.length - 1];
      if (last.trim().length > 0) {
        result.push(last.trimEnd());
      }
    } else {
      result.push(line.trimEnd());
    }
  }

  return result;
}

/**
 * Estimates token count for an arbitrary block of text.
 * Heuristic based on OpenAI/Anthropic tokenizers for code/logs (~3.8 characters per token).
 */
export function estimateTokens(textOrCharCount: string | number): number {
  const chars = typeof textOrCharCount === 'string' ? textOrCharCount.length : textOrCharCount;
  if (chars <= 0) return 0;
  return Math.max(1, Math.ceil(chars / 3.8));
}
