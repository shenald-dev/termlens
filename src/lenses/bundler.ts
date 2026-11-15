import { SemanticLens } from './lens.interface.js';
import { LensProcessResult, ErrorDetail } from '../types.js';

export class BundlerLens implements SemanticLens {
  public readonly name = 'bundler';
  public readonly description = 'Modern bundlers and frameworks (Vite, Next.js, Turbopack, Webpack, esbuild, Rollup)';

  public canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (
      cmd.includes('vite') ||
      cmd.includes('next') ||
      cmd.includes('webpack') ||
      cmd.includes('turbopack') ||
      cmd.includes('rollup') ||
      cmd.includes('esbuild')
    ) {
      return true;
    }

    return sampleLines.some(line =>
      line.includes('[vite]') ||
      line.includes('Failed to compile') ||
      line.includes('Module not found:') ||
      line.includes('RollupError') ||
      line.includes('Turbopack build failed') ||
      line.match(/ERROR in [./\\]+/)
    );
  }

  public process(lines: string[], exitCode: number): LensProcessResult {
    const errors: ErrorDetail[] = [];
    const highlights: string[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 1. Vite error: [vite] Internal server error: ...
      if (line.includes('[vite]')) {
        let msg = line.replace(/\[vite\]\s*/, '').trim();
        let file: string | undefined;
        let lineNum: number | undefined;
        let colNum: number | undefined;
        const snippetLines: string[] = [];

        i++;
        while (i < lines.length && i < lines.length) {
          const next = lines[i];
          if (next.includes('[vite]') || next.startsWith('error') || next.match(/^\d+:\d+:\d+/)) {
            break;
          }

          const fileMatch = next.match(/(?:file:|Plugin:.*?File:)\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)(?::(\d+)(?::(\d+))?)?/i)
            || next.match(/^\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+):(\d+):(\d+)/);
          if (fileMatch && !file) {
            file = fileMatch[1];
            if (fileMatch[2]) lineNum = parseInt(fileMatch[2], 10);
            if (fileMatch[3]) colNum = parseInt(fileMatch[3], 10);
          } else if (next.trim().startsWith('> ') || next.match(/^\s*\d+\s*\|/)) {
            snippetLines.push(next);
          }
          i++;
        }

        errors.push({
          file,
          line: lineNum,
          column: colNum,
          message: msg,
          snippet: snippetLines.length > 0 ? snippetLines.join('\n') : undefined
        });
        continue;
      }

      // 2. Webpack error: ERROR in ./src/index.js 5:12 or Module not found
      const webpackMatch = line.match(/ERROR in\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+)(?:\s+(\d+):(\d+))?/i);
      if (webpackMatch) {
        const file = webpackMatch[1];
        const lineNum = webpackMatch[2] ? parseInt(webpackMatch[2], 10) : undefined;
        const colNum = webpackMatch[3] ? parseInt(webpackMatch[3], 10) : undefined;
        let msg = 'Module build failed';
        const snippetLines: string[] = [];

        i++;
        while (i < lines.length && !lines[i].startsWith('ERROR in')) {
          const sub = lines[i];
          if (sub.includes('Module not found:') || sub.includes('SyntaxError:')) {
            msg = sub.trim();
          } else if (sub.trim().startsWith('> ') || sub.match(/^\s*\d+\s*\|/)) {
            snippetLines.push(sub);
          }
          i++;
        }

        errors.push({
          file,
          line: lineNum,
          column: colNum,
          message: msg,
          snippet: snippetLines.length > 0 ? snippetLines.join('\n') : undefined
        });
        continue;
      }

      // 3. esbuild error: X [ERROR] Expected ";" but found "..."
      const esbuildMatch = line.match(/X\s+\[ERROR\]\s+(.+)$/i);
      if (esbuildMatch) {
        const msg = esbuildMatch[1].trim();
        let file: string | undefined;
        let lineNum: number | undefined;
        let colNum: number | undefined;
        const snippetLines: string[] = [];

        i++;
        while (i < lines.length && !lines[i].startsWith('X [ERROR]')) {
          const sub = lines[i];
          const locMatch = sub.match(/^\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+):(\d+):(\d+):/);
          if (locMatch && !file) {
            file = locMatch[1];
            lineNum = parseInt(locMatch[2], 10);
            colNum = parseInt(locMatch[3], 10);
          } else if (sub.match(/^\s*\d+\s*│/) || sub.match(/^\s*~/)) {
            snippetLines.push(sub);
          }
          i++;
        }

        errors.push({
          file,
          line: lineNum,
          column: colNum,
          message: msg,
          snippet: snippetLines.length > 0 ? snippetLines.join('\n') : undefined
        });
        continue;
      }

      // 4. Next.js / Generic compile failure: ./app/page.tsx:12:3 - Error: ...
      const nextMatch = line.match(/^\.\/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_]+):(\d+):(\d+)/);
      if (nextMatch) {
        const file = nextMatch[1];
        const lineNum = parseInt(nextMatch[2], 10);
        const colNum = parseInt(nextMatch[3], 10);
        let msg = line.replace(/^\.\/[^:]+:\d+:\d+\s*/, '').trim() || 'Compilation failure';

        i++;
        if (i < lines.length && lines[i].includes('error')) {
          msg = lines[i].trim();
          i++;
        }

        errors.push({
          file,
          line: lineNum,
          column: colNum,
          message: msg
        });
        continue;
      }

      i++;
    }

    if (errors.length === 0 && exitCode !== 0) {
      return {
        summary: 'Build tool exited with failure, but no specific module/bundle errors were isolated.',
        errors: [{ message: 'Bundle compilation failed with exit code ' + exitCode }],
        highlights
      };
    }

    const summary = exitCode === 0
      ? 'Bundle compilation succeeded with zero errors.'
      : `${errors.length} build error${errors.length === 1 ? '' : 's'} isolated across bundling pipeline.`;

    return {
      summary,
      errors,
      highlights,
      suggestedAction: errors.length > 0 ? 'Resolve missing module dependencies or syntax errors in cited source files.' : undefined
    };
  }
}
