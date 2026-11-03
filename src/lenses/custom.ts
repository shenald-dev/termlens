import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';
import { CustomLensDef } from '../config.js';

export class CustomLens implements SemanticLens {
  readonly name: string;
  readonly description: string;
  private def: CustomLensDef;
  private regex: RegExp;

  constructor(def: CustomLensDef) {
    this.def = def;
    this.name = def.name;
    this.description = def.description || `User-defined custom lens (${def.name})`;
    this.regex = new RegExp(def.errorPattern, 'i');
  }

  canHandle(command: string, sampleLines: string[]): boolean {
    if (this.def.matchCommand) {
      const cmdRegex = new RegExp(this.def.matchCommand, 'i');
      if (cmdRegex.test(command)) return true;
    }

    if (this.def.matchOutput) {
      const outRegex = new RegExp(this.def.matchOutput, 'i');
      const sample = sampleLines.join('\n');
      if (outRegex.test(sample)) return true;
    }

    return false;
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0) {
      return {
        summary: `Command succeeded (${this.name})`,
        errors: [],
        highlights: ['✓ Zero errors reported']
      };
    }

    const errors: ErrorDetail[] = [];
    const filesWithErrors = new Set<string>();

    for (const line of lines) {
      const match = line.match(this.regex);
      if (match) {
        const file = this.def.fileGroup !== undefined ? match[this.def.fileGroup]?.trim() : undefined;
        const lineNum = this.def.lineGroup !== undefined && match[this.def.lineGroup]
          ? parseInt(match[this.def.lineGroup], 10)
          : undefined;
        const colNum = this.def.colGroup !== undefined && match[this.def.colGroup]
          ? parseInt(match[this.def.colGroup], 10)
          : undefined;
        const code = this.def.codeGroup !== undefined ? match[this.def.codeGroup]?.trim() : undefined;
        const message = this.def.messageGroup !== undefined
          ? match[this.def.messageGroup]?.trim()
          : line.trim();

        if (file) filesWithErrors.add(file);
        errors.push({
          file,
          line: lineNum,
          column: colNum,
          code,
          message: message || line.trim()
        });
      }
    }

    if (errors.length === 0 && exitCode !== 0) {
      errors.push({
        message: lines.slice(0, 3).join('\n') || `Custom lens (${this.name}) failed with exit code ${exitCode}`
      });
    }

    return {
      summary: `${errors.length} error${errors.length === 1 ? '' : 's'} isolated via ${this.name}`,
      errors,
      highlights: Array.from(filesWithErrors).map(f => `File: ${f}`)
    };
  }
}
