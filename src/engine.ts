import { spawn } from 'node:child_process';
import { RingBuffer } from './utils/ring-buffer.js';
import { normalizeLines, estimateTokens } from './utils/ansi.js';
import { LensRegistry } from './lenses/index.js';
import { formatHuman } from './formatters/human.js';
import { formatAgent, formatJson } from './formatters/agent.js';
import { TermlensExecutionResult, TermlensOptions } from './types.js';

export class TermlensEngine {
  private registry: LensRegistry;

  constructor(registry?: LensRegistry) {
    this.registry = registry || new LensRegistry();
  }

  /**
   * Executes a command with streaming ring-buffer capture and semantic lens filtering.
   */
  public async execute(command: string, options: TermlensOptions = {}): Promise<TermlensExecutionResult> {
    const startTime = Date.now();
    const ringBuffer = new RingBuffer<string>(options.tailLines ? Math.max(500, options.tailLines * 10) : 1000);
    const rawChunks: Buffer[] = [];
    let rawCharCount = 0;
    let rawLineCount = 0;

    const isWindows = process.platform === 'win32';
    const shellCmd = isWindows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
    const shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command];

    return new Promise<TermlensExecutionResult>((resolve) => {
      let child: ReturnType<typeof spawn>;
      let timedOut = false;
      let timer: NodeJS.Timeout | undefined;

      try {
        child = spawn(shellCmd, shellArgs, {
          cwd: options.cwd || process.cwd(),
          env: options.env || process.env,
          windowsVerbatimArguments: isWindows,
          stdio: ['inherit', 'pipe', 'pipe']
        });
      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const errMsg = err instanceof Error ? err.message : String(err);
        const result: TermlensExecutionResult = {
          command,
          exitCode: 1,
          durationMs,
          lensUsed: 'system',
          status: 'failure',
          rawLineCount: 1,
          rawCharCount: errMsg.length,
          compactLineCount: 1,
          compactCharCount: errMsg.length,
          tokenSavingsPct: 0,
          rawEstimatedTokens: estimateTokens(errMsg),
          compactEstimatedTokens: estimateTokens(errMsg),
          summary: `Failed to spawn command: ${errMsg}`,
          errors: [{ message: errMsg }],
          highlights: [],
          rawTail: [errMsg],
          humanFormatted: `Failed to spawn: ${errMsg}`,
          agentFormatted: `Failed to spawn: ${errMsg}`,
          jsonFormatted: JSON.stringify({ error: errMsg })
        };
        return resolve(result);
      }

      if (options.timeoutMs && options.timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          try {
            if (isWindows && child.pid) {
              spawn('taskkill', ['/PID', child.pid.toString(), '/T', '/F'], { stdio: 'ignore' });
            } else {
              child.kill('SIGKILL');
            }
          } catch {
            // Ignore
          }
        }, options.timeoutMs);
      }

      const handleChunk = (chunk: Buffer) => {
        rawChunks.push(chunk);
        rawCharCount += chunk.length;
        const text = chunk.toString('utf-8');
        const lines = text.split(/\r?\n/);
        rawLineCount += Math.max(1, lines.length - 1);
        for (const line of lines) {
          if (line.length > 0) {
            ringBuffer.push(line);
          }
        }
      };

      if (child.stdout) {
        child.stdout.on('data', handleChunk);
      }
      if (child.stderr) {
        child.stderr.on('data', handleChunk);
      }

      child.on('error', (err) => {
        handleChunk(Buffer.from(`Process error: ${err.message}\n`));
      });

      child.on('close', (code, _signal) => {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startTime;
        const exitCode = timedOut ? 124 : (code ?? (timedOut ? 1 : 0));

        // Aggregate collected output
        const fullRawText = Buffer.concat(rawChunks).toString('utf-8');
        const normalizedLines = normalizeLines(fullRawText);
        const finalRawLines = normalizedLines.length > 0 ? normalizedLines : ringBuffer.toArray();

        // Select and run lens
        const lens = this.registry.getLens(options.lens, command, finalRawLines.slice(0, 50));
        const lensOutput = lens.process(finalRawLines, exitCode);

        // Retain raw tail for edge-case diagnostics
        const tailCount = options.tailLines || 8;
        const rawTail = finalRawLines.slice(-tailCount);

        const status = timedOut ? 'timeout' : (exitCode === 0 ? 'success' : 'failure');

        // Build provisional result to format
        const provisional: TermlensExecutionResult = {
          command,
          exitCode,
          durationMs,
          lensUsed: lens.name,
          status,
          rawLineCount: Math.max(1, rawLineCount, finalRawLines.length),
          rawCharCount: Math.max(1, rawCharCount, fullRawText.length),
          compactLineCount: 0,
          compactCharCount: 0,
          tokenSavingsPct: 0,
          rawEstimatedTokens: estimateTokens(fullRawText),
          compactEstimatedTokens: 0,
          summary: timedOut ? `Command timed out after ${options.timeoutMs}ms` : lensOutput.summary,
          errors: lensOutput.errors,
          highlights: lensOutput.highlights || [],
          suggestedAction: lensOutput.suggestedAction,
          rawTail,
          humanFormatted: '',
          agentFormatted: '',
          jsonFormatted: ''
        };

        // Generate agent view first to determine compact metrics
        const agentView = formatAgent(provisional);
        const compactChars = agentView.length;
        const compactLines = agentView.split('\n').length;
        const compactTokens = estimateTokens(agentView);
        const savingsPct = provisional.rawEstimatedTokens > 0
          ? Math.max(0, Math.min(99.9, ((provisional.rawEstimatedTokens - compactTokens) / provisional.rawEstimatedTokens) * 100))
          : 0;

        provisional.compactCharCount = compactChars;
        provisional.compactLineCount = compactLines;
        provisional.compactEstimatedTokens = compactTokens;
        provisional.tokenSavingsPct = savingsPct;
        provisional.agentFormatted = agentView;

        // Generate human view with accurate metrics
        provisional.humanFormatted = formatHuman(provisional);
        provisional.jsonFormatted = formatJson(provisional);

        resolve(provisional);
      });
    });
  }

  /**
   * Compacts an existing text block or log string without spawning a process.
   */
  public compactText(text: string, lensName?: string, commandName: string = 'piped_input'): TermlensExecutionResult {
    const normalizedLines = normalizeLines(text);
    const lens = this.registry.getLens(lensName, commandName, normalizedLines.slice(0, 50));
    const isError = text.toLowerCase().includes('fail') || text.toLowerCase().includes('error');
    const exitCode = isError ? 1 : 0;
    const lensOutput = lens.process(normalizedLines, exitCode);

    const rawTokens = estimateTokens(text);
    const provisional: TermlensExecutionResult = {
      command: commandName,
      exitCode,
      durationMs: 0,
      lensUsed: lens.name,
      status: exitCode === 0 ? 'success' : 'failure',
      rawLineCount: normalizedLines.length,
      rawCharCount: text.length,
      compactLineCount: 0,
      compactCharCount: 0,
      tokenSavingsPct: 0,
      rawEstimatedTokens: rawTokens,
      compactEstimatedTokens: 0,
      summary: lensOutput.summary,
      errors: lensOutput.errors,
      highlights: lensOutput.highlights || [],
      suggestedAction: lensOutput.suggestedAction,
      rawTail: normalizedLines.slice(-5),
      humanFormatted: '',
      agentFormatted: '',
      jsonFormatted: ''
    };

    const agentView = formatAgent(provisional);
    const compactTokens = estimateTokens(agentView);
    const savingsPct = rawTokens > 0
      ? Math.max(0, Math.min(99.9, ((rawTokens - compactTokens) / rawTokens) * 100))
      : 0;

    provisional.compactCharCount = agentView.length;
    provisional.compactLineCount = agentView.split('\n').length;
    provisional.compactEstimatedTokens = compactTokens;
    provisional.tokenSavingsPct = savingsPct;
    provisional.agentFormatted = agentView;
    provisional.humanFormatted = formatHuman(provisional);
    provisional.jsonFormatted = formatJson(provisional);

    return provisional;
  }
}
