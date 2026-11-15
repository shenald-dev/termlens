import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RingBuffer } from './utils/ring-buffer.js';
import { normalizeLines, estimateTokens } from './utils/ansi.js';
import { LensRegistry } from './lenses/index.js';
import { formatHuman } from './formatters/human.js';
import { formatAgent, formatJson } from './formatters/agent.js';
import { formatCiAnnotations } from './formatters/ci.js';
import { clusterErrors } from './utils/cluster.js';
import { calculateTelemetry } from './utils/telemetry.js';
import { SourceContextResolver } from './utils/source-resolver.js';
import { RemediationEngine } from './utils/remediation.js';
import { FlightRecorder } from './flight/recorder.js';
import { diffFlights } from './flight/diff.js';
import {
  TermlensExecutionResult,
  TermlensOptions,
  FlightRecord,
  FlightDiffResult
} from './types.js';

export class TermlensEngine {
  private registry: LensRegistry;
  private sourceResolver: SourceContextResolver;
  private remediationEngine: RemediationEngine;
  private flightRecorder: FlightRecorder;

  constructor(registry?: LensRegistry, flightDir?: string) {
    this.registry = registry || new LensRegistry();
    this.sourceResolver = new SourceContextResolver();
    this.remediationEngine = new RemediationEngine();
    this.flightRecorder = new FlightRecorder(flightDir);
  }

  public getRegistry(): LensRegistry {
    return this.registry;
  }

  public getFlightRecorder(): FlightRecorder {
    return this.flightRecorder;
  }

  public getSourceResolver(): SourceContextResolver {
    return this.sourceResolver;
  }

  public getRemediationEngine(): RemediationEngine {
    return this.remediationEngine;
  }

  /**
   * Executes a command with streaming ring-buffer capture and semantic lens filtering.
   */
  public async execute(command: string, options: TermlensOptions = {}): Promise<TermlensExecutionResult> {
    const startTime = Date.now();
    const ringBuffer = new RingBuffer<string>(options.tailLines ? Math.max(500, options.tailLines * 10) : 1000);
    const rawChunks: Buffer[] = [];
    let rawAccumulatedBytes = 0;
    const maxRawBytes = options.maxRawBytes ?? 10 * 1024 * 1024; // 10 MB streaming ceiling
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
          estimatedCostSavingsUsd: 0,
          summary: `Failed to spawn command: ${errMsg}`,
          errors: [{ message: errMsg }],
          clusters: [{ exemplar: { message: errMsg }, occurrences: 1, locations: [], isClustered: false }],
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
        if (rawAccumulatedBytes < maxRawBytes) {
          rawChunks.push(chunk);
          rawAccumulatedBytes += chunk.length;
        }
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

      child.on('close', async (code, _signal) => {
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

        // Enrich source context unless opted out
        if (options.enrichSource !== false) {
          this.sourceResolver.enrichErrors(lensOutput.errors, options.cwd || process.cwd());
        }

        // Run autonomous remediation engine
        const remediations = this.remediationEngine.analyze(lensOutput.errors, command);
        if (!lensOutput.suggestedAction && remediations.length > 0) {
          lensOutput.suggestedAction = remediations[0].explanation;
        }

        // Cluster and deduplicate errors unless disabled
        const maxErrors = options.maxErrors ?? 8;
        const clustered = options.noCluster
          ? {
              clusters: lensOutput.errors.map(e => ({ exemplar: e, occurrences: 1, locations: [], isClustered: false })),
              totalOriginal: lensOutput.errors.length,
              deduplicatedCount: lensOutput.errors.length,
              omittedCount: 0
            }
          : clusterErrors(lensOutput.errors, maxErrors);

        // Retain raw tail for edge-case diagnostics
        const tailCount = options.tailLines || 8;
        const rawTail = finalRawLines.slice(-tailCount);

        const status = timedOut ? 'timeout' : (exitCode === 0 ? 'success' : 'failure');

        // Check for flight diff
        let flightDiff: FlightDiffResult | undefined;
        if (options.diffWithLast || options.diffWithFlightId) {
          const baseFlight = options.diffWithFlightId
            ? this.flightRecorder.get(options.diffWithFlightId)
            : this.flightRecorder.getLatest();

          if (baseFlight) {
            const tempTargetFlight: FlightRecord = {
              id: 'current_run',
              timestamp: new Date().toISOString(),
              command,
              cwd: options.cwd || process.cwd(),
              exitCode,
              durationMs,
              status,
              lensUsed: lens.name,
              summary: timedOut ? `Command timed out after ${options.timeoutMs}ms` : lensOutput.summary,
              errorCount: lensOutput.errors.length,
              clusterCount: clustered.clusters.length,
              clusters: clustered.clusters,
              errors: lensOutput.errors,
              remediations,
              telemetry: {
                rawLines: Math.max(1, rawLineCount, finalRawLines.length),
                compactLines: 0,
                rawEstimatedTokens: estimateTokens(fullRawText),
                compactEstimatedTokens: 0,
                tokensSaved: 0,
                tokenSavingsPct: 0,
                estimatedCostSavingsUsd: 0
              }
            };
            flightDiff = diffFlights(baseFlight, tempTargetFlight);
          }
        }

        // Build provisional result
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
          estimatedCostSavingsUsd: 0,
          summary: timedOut ? `Command timed out after ${options.timeoutMs}ms` : lensOutput.summary,
          errors: lensOutput.errors,
          clusters: clustered.clusters,
          highlights: lensOutput.highlights || [],
          suggestedAction: lensOutput.suggestedAction,
          rawTail,
          humanFormatted: '',
          agentFormatted: '',
          jsonFormatted: '',
          remediations,
          flightDiff
        };

        // Generate preliminary agent view to measure compact line metrics
        const quiet = options.quietSuccess ?? false;
        const preliminaryAgent = formatAgent(provisional, quiet);
        const compactLines = preliminaryAgent.split('\n').length;

        const telemetry = calculateTelemetry(
          provisional.rawLineCount,
          compactLines,
          provisional.rawEstimatedTokens,
          preliminaryAgent
        );

        provisional.compactCharCount = preliminaryAgent.length;
        provisional.compactLineCount = compactLines;
        provisional.compactEstimatedTokens = telemetry.compactEstimatedTokens;
        provisional.tokenSavingsPct = telemetry.tokenSavingsPct;
        provisional.estimatedCostSavingsUsd = telemetry.estimatedCostSavingsUsd;

        // Record flight with FULL accurate telemetry
        if (options.recordFlight !== false) {
          const rec = await this.flightRecorder.record(provisional, options.cwd || process.cwd(), remediations);
          if (rec) {
            provisional.flightId = rec.id;
          }
        }

        // Regenerate agent, human, json, and ci views with accurate reduction metrics and flight ID
        provisional.agentFormatted = formatAgent(provisional, quiet);
        provisional.humanFormatted = formatHuman(provisional, quiet);
        provisional.jsonFormatted = formatJson(provisional);
        provisional.ciFormatted = formatCiAnnotations(provisional);

        // If output file was requested, save it
        if (options.outputFile) {
          try {
            const outDir = path.dirname(options.outputFile);
            if (!fs.existsSync(outDir)) {
              fs.mkdirSync(outDir, { recursive: true });
            }
            const content = options.jsonMode
              ? provisional.jsonFormatted
              : (options.agentMode ? provisional.agentFormatted : provisional.humanFormatted);
            fs.writeFileSync(options.outputFile, content, 'utf-8');
          } catch {
            // Non-fatal
          }
        }

        resolve(provisional);
      });
    });
  }

  /**
   * Compacts an existing text block or log string without spawning a process.
   */
  public compactText(
    text: string,
    lensName?: string,
    commandName: string = 'piped_input',
    options: TermlensOptions = {}
  ): TermlensExecutionResult {
    const normalizedLines = normalizeLines(text);
    const lens = this.registry.getLens(lensName || options.lens, commandName, normalizedLines.slice(0, 50));
    const isError = text.toLowerCase().includes('fail') || text.toLowerCase().includes('error');
    const exitCode = isError ? 1 : 0;
    const lensOutput = lens.process(normalizedLines, exitCode);

    // Enrich source context unless opted out
    if (options.enrichSource !== false) {
      this.sourceResolver.enrichErrors(lensOutput.errors, options.cwd || process.cwd());
    }

    // Run autonomous remediation engine
    const remediations = this.remediationEngine.analyze(lensOutput.errors, commandName);
    if (!lensOutput.suggestedAction && remediations.length > 0) {
      lensOutput.suggestedAction = remediations[0].explanation;
    }

    const maxErrors = options.maxErrors ?? 8;
    const clustered = options.noCluster
      ? {
          clusters: lensOutput.errors.map(e => ({ exemplar: e, occurrences: 1, locations: [], isClustered: false })),
          totalOriginal: lensOutput.errors.length,
          deduplicatedCount: lensOutput.errors.length,
          omittedCount: 0
        }
      : clusterErrors(lensOutput.errors, maxErrors);

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
      estimatedCostSavingsUsd: 0,
      summary: lensOutput.summary,
      errors: lensOutput.errors,
      clusters: clustered.clusters,
      highlights: lensOutput.highlights || [],
      suggestedAction: lensOutput.suggestedAction,
      rawTail: normalizedLines.slice(-5),
      humanFormatted: '',
      agentFormatted: '',
      jsonFormatted: '',
      remediations
    };

    const quiet = options.quietSuccess ?? false;
    const preliminaryAgent = formatAgent(provisional, quiet);
    const compactLines = preliminaryAgent.split('\n').length;
    const telemetry = calculateTelemetry(
      provisional.rawLineCount,
      compactLines,
      rawTokens,
      preliminaryAgent
    );

    provisional.compactCharCount = preliminaryAgent.length;
    provisional.compactLineCount = compactLines;
    provisional.compactEstimatedTokens = telemetry.compactEstimatedTokens;
    provisional.tokenSavingsPct = telemetry.tokenSavingsPct;
    provisional.estimatedCostSavingsUsd = telemetry.estimatedCostSavingsUsd;

    provisional.agentFormatted = formatAgent(provisional, quiet);
    provisional.humanFormatted = formatHuman(provisional, quiet);
    provisional.jsonFormatted = formatJson(provisional);
    provisional.ciFormatted = formatCiAnnotations(provisional);

    if (options.outputFile) {
      try {
        const outDir = path.dirname(options.outputFile);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }
        const content = options.jsonMode
          ? provisional.jsonFormatted
          : (options.agentMode ? provisional.agentFormatted : provisional.humanFormatted);
        fs.writeFileSync(options.outputFile, content, 'utf-8');
      } catch {
        // Non-fatal
      }
    }

    return provisional;
  }
}
