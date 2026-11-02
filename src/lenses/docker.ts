import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class DockerLens implements SemanticLens {
  readonly name = 'docker';
  readonly description = 'Semantic lens for Docker / Container builds';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('docker ') || cmd.includes('podman ')) return true;
    const sample = sampleLines.join('\n');
    return sample.includes('=> [internal]') || sample.includes('Dockerfile:') || sample.includes('ERROR: failed to solve:');
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0) {
      return {
        summary: 'Docker build succeeded',
        errors: [],
        highlights: ['✓ Container built successfully']
      };
    }

    const errors: ErrorDetail[] = [];
    const highlights: string[] = [];
    const failedSteps: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // e.g. "ERROR: failed to solve: process "/bin/sh -c npm run build" did not complete successfully: exit code: 1"
      if (line.includes('ERROR:') || line.includes('error:')) {
        highlights.push(line.trim());
      }

      // Step failure: e.g. "------\n > [builder 4/5] RUN npm run build:\n"
      if (line.startsWith(' > [') || line.startsWith(' > RUN')) {
        failedSteps.push(line.trim());
      }

      // Dockerfile line indicator: e.g. "------\n 14 | >>> RUN npm run build\n 15 |     EXPOSE 3000\n"
      const dockerfileLine = line.match(/^\s*(\d+)\s*\|\s*>>>\s*(.*)$/);
      if (dockerfileLine) {
        errors.push({
          file: 'Dockerfile',
          line: parseInt(dockerfileLine[1], 10),
          message: dockerfileLine[2].trim()
        });
      }
    }

    if (errors.length === 0) {
      errors.push({
        message: highlights.join('\n') || failedSteps.join('\n') || 'Docker build failed'
      });
    }

    return {
      summary: 'Docker build failed at step',
      errors,
      highlights
    };
  }
}
