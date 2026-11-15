import fs from 'node:fs';
import path from 'node:path';
import { ErrorDetail, SourceContext, SourceLine } from '../types.js';

export class SourceContextResolver {
  private fileCache: Map<string, string[]> = new Map();
  private maxCacheEntries = 64;
  private maxFileSizeBytes = 1024 * 1024; // 1 MB limit

  /**
   * Enriches a list of error details with surrounding source code context.
   */
  public enrichErrors(
    errors: ErrorDetail[],
    cwd: string = process.cwd(),
    contextRadius: number = 2
  ): ErrorDetail[] {
    for (const err of errors) {
      if (!err.file || !err.line) continue;
      const context = this.resolve(err.file, err.line, err.column, cwd, contextRadius);
      if (context) {
        err.sourceContext = context;
        if (!err.snippet) {
          err.snippet = context.formattedSnippet;
        }
      }
    }
    return errors;
  }

  /**
   * Resolves source context for a specific file coordinate.
   */
  public resolve(
    filePath: string,
    line: number,
    column?: number,
    cwd: string = process.cwd(),
    contextRadius: number = 2
  ): SourceContext | null {
    if (!filePath || typeof line !== 'number' || line <= 0) {
      return null;
    }

    try {
      const resolvedPath = path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.normalize(path.resolve(cwd, filePath));

      // Path safety check: ensure the file exists
      if (!fs.existsSync(resolvedPath)) {
        return null;
      }

      // Canonical path containment: ensure resolved path is strictly within cwd
      // Resolves symbolic links to their real target to prevent symlink escape
      const realCwd = fs.realpathSync(cwd);
      const realFile = fs.realpathSync(resolvedPath);
      const relative = path.relative(realCwd, realFile);

      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return null;
      }

      // Sensitive file filter: prevent reading secrets, credentials, or VCS metadata
      const fileName = path.basename(realFile).toLowerCase();
      if (
        fileName.startsWith('.env') ||
        fileName.endsWith('.pem') ||
        fileName.endsWith('.key') ||
        fileName.endsWith('.pfx') ||
        fileName.endsWith('.p12') ||
        fileName === 'id_rsa' ||
        fileName === 'id_ed25519'
      ) {
        return null;
      }

      const normalizedReal = realFile.toLowerCase().replace(/\\/g, '/');
      if (normalizedReal.includes('/.git/') || normalizedReal.includes('/.ssh/')) {
        return null;
      }

      const stat = fs.statSync(realFile);
      if (!stat.isFile() || stat.size > this.maxFileSizeBytes) {
        return null;
      }

      let lines = this.fileCache.get(realFile);
      if (!lines) {
        const content = fs.readFileSync(realFile, 'utf-8');
        lines = content.split(/\r?\n/);
        if (this.fileCache.size >= this.maxCacheEntries) {
          const firstKey = this.fileCache.keys().next().value;
          if (firstKey) this.fileCache.delete(firstKey);
        }
        this.fileCache.set(realFile, lines);
      }

      const totalLines = lines.length;
      if (line > totalLines) {
        return null;
      }

      const startIdx = Math.max(0, line - 1 - contextRadius);
      const endIdx = Math.min(totalLines, line + contextRadius);

      const sourceLines: SourceLine[] = [];
      const snippetParts: string[] = [];
      const maxLineNumWidth = String(endIdx).length;

      for (let i = startIdx; i < endIdx; i++) {
        const curLineNum = i + 1;
        const isTarget = curLineNum === line;
        const content = lines[i];

        sourceLines.push({
          lineNum: curLineNum,
          content,
          isTarget
        });

        const pointer = isTarget ? '>' : ' ';
        const paddedNum = String(curLineNum).padStart(maxLineNumWidth, ' ');
        snippetParts.push(`${pointer} ${paddedNum} | ${content}`);
      }

      return {
        file: filePath,
        line,
        column,
        lines: sourceLines,
        formattedSnippet: snippetParts.join('\n')
      };
    } catch {
      return null;
    }
  }

  /**
   * Clears in-memory source file cache.
   */
  public clearCache(): void {
    this.fileCache.clear();
  }
}
