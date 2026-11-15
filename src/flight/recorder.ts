import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  FlightRecord,
  TermlensExecutionResult,
  RemediationPlan
} from '../types.js';

export class FlightRecorder {
  private baseDir: string;
  private maxStoredFlights: number;

  constructor(customDir?: string, maxStored: number = 50) {
    this.baseDir = customDir
      ? path.resolve(customDir)
      : path.join(process.cwd(), '.termlens', 'flights');
    this.maxStoredFlights = maxStored;
  }

  /**
   * Records a flight run from a Termlens execution result.
   */
  public async record(
    result: TermlensExecutionResult,
    cwd: string = process.cwd(),
    remediations: RemediationPlan[] = []
  ): Promise<FlightRecord | null> {
    try {
      this.ensureDirectory();

      const id = `flt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const gitInfo = this.getGitInfo(cwd);

      const flight: FlightRecord = {
        id,
        timestamp: new Date().toISOString(),
        command: result.command,
        cwd,
        gitBranch: gitInfo.branch,
        gitCommit: gitInfo.commit,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        status: result.status,
        lensUsed: result.lensUsed,
        summary: result.summary,
        errorCount: result.errors.length,
        clusterCount: result.clusters.length,
        clusters: result.clusters,
        errors: result.errors,
        remediations,
        telemetry: {
          rawLines: result.rawLineCount,
          compactLines: result.compactLineCount,
          rawEstimatedTokens: result.rawEstimatedTokens,
          compactEstimatedTokens: result.compactEstimatedTokens,
          tokensSaved: Math.max(0, result.rawEstimatedTokens - result.compactEstimatedTokens),
          tokenSavingsPct: result.tokenSavingsPct,
          estimatedCostSavingsUsd: result.estimatedCostSavingsUsd
        }
      };

      const filePath = path.join(this.baseDir, `${id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(flight, null, 2), 'utf-8');

      // Update pointer to latest
      const latestPath = path.join(this.baseDir, 'latest.json');
      fs.writeFileSync(latestPath, JSON.stringify({ id, timestamp: flight.timestamp }, null, 2), 'utf-8');

      this.pruneOldFlights();
      return flight;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves a recorded flight by its ID.
   */
  public get(id: string): FlightRecord | null {
    try {
      const cleanId = id.endsWith('.json') ? id : `${id}.json`;
      const filePath = path.join(this.baseDir, cleanId);
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as FlightRecord;
    } catch {
      return null;
    }
  }

  /**
   * Retrieves the most recent flight record.
   */
  public getLatest(): FlightRecord | null {
    try {
      const latestPath = path.join(this.baseDir, 'latest.json');
      if (fs.existsSync(latestPath)) {
        const meta = JSON.parse(fs.readFileSync(latestPath, 'utf-8')) as { id: string };
        if (meta.id) {
          const direct = this.get(meta.id);
          if (direct) return direct;
        }
      }

      const all = this.list(1);
      return all.length > 0 ? all[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Lists historical flight recordings ordered newest to oldest.
   */
  public list(limit: number = 20): FlightRecord[] {
    try {
      if (!fs.existsSync(this.baseDir)) return [];
      const files = fs.readdirSync(this.baseDir)
        .filter(f => f.startsWith('flt_') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const records: FlightRecord[] = [];
      for (const f of files) {
        try {
          const p = path.join(this.baseDir, f);
          const raw = fs.readFileSync(p, 'utf-8');
          records.push(JSON.parse(raw) as FlightRecord);
        } catch {
          // ignore corrupted file
        }
      }
      return records;
    } catch {
      return [];
    }
  }

  /**
   * Cleans up excess flight records past retention limit.
   */
  private pruneOldFlights(): void {
    try {
      if (!fs.existsSync(this.baseDir)) return;
      const files = fs.readdirSync(this.baseDir)
        .filter(f => f.startsWith('flt_') && f.endsWith('.json'))
        .sort(); // oldest first

      if (files.length > this.maxStoredFlights) {
        const toDelete = files.slice(0, files.length - this.maxStoredFlights);
        for (const file of toDelete) {
          try {
            fs.unlinkSync(path.join(this.baseDir, file));
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getGitInfo(cwd: string): { branch?: string; commit?: string } {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout: 1000
      }).trim();
      const commit = execSync('git rev-parse --short HEAD', {
        cwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf-8',
        timeout: 1000
      }).trim();
      return { branch: branch || undefined, commit: commit || undefined };
    } catch {
      return {};
    }
  }
}
