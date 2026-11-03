import { SemanticLens } from './lens.interface.js';
import { ErrorDetail, LensProcessResult } from '../types.js';

export class DotnetLens implements SemanticLens {
  readonly name = 'dotnet';
  readonly description = 'Semantic lens for .NET C# toolchain (dotnet test, dotnet build, MSBuild)';

  canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (cmd.includes('dotnet ') || cmd.includes('msbuild')) {
      return true;
    }
    const sample = sampleLines.join('\n');
    return /:\s+error\s+CS\d+:/.test(sample) || sample.includes('Failed!') && sample.includes('Passed:') || sample.includes('[FAIL]');
  }

  process(lines: string[], exitCode: number): LensProcessResult {
    if (exitCode === 0) {
      const passedLine = lines.find(l => l.includes('Passed!') || (l.includes('Build succeeded') && !l.includes('Build failed')));
      return {
        summary: passedLine ? passedLine.trim() : '.NET build/test succeeded with zero errors',
        errors: [],
        highlights: ['✓ .NET execution passed']
      };
    }

    const errors: ErrorDetail[] = [];
    const filesWithErrors = new Set<string>();

    // Regex 1: Compiler error format:
    // Controllers/UserController.cs(45,12): error CS1503: Argument 1: cannot convert from 'int' to 'string' [MyProject.csproj]
    const compileRegex = /^([a-zA-Z0-9_\-./\\]+\.cs)\((\d+),(\d+)\):\s+error\s+(CS\d+):\s+(.*?)(?:\s+\[.*\])?$/;

    // Regex 2: Project level error:
    // CSC : error CS0103: The name 'xyz' does not exist in the current context
    const cscRegex = /^CSC\s*:\s*error\s+(CS\d+):\s+(.*)$/;

    // Mode 3: Test runner failures:
    // [FAIL] MyNamespace.Tests.UserAuthTests.TestExpiredToken
    // Expected: 401
    // Actual: 200
    let inTestFail = false;
    let currentTestError: Partial<ErrorDetail> | null = null;

    for (const line of lines) {
      const compileMatch = line.match(compileRegex);
      if (compileMatch) {
        const file = compileMatch[1].trim();
        const lineNum = parseInt(compileMatch[2], 10);
        const colNum = parseInt(compileMatch[3], 10);
        const code = compileMatch[4];
        const message = compileMatch[5].trim();

        filesWithErrors.add(file);
        errors.push({
          file,
          line: lineNum,
          column: colNum,
          code,
          message
        });
        continue;
      }

      const cscMatch = line.match(cscRegex);
      if (cscMatch) {
        errors.push({
          code: cscMatch[1],
          message: cscMatch[2].trim()
        });
        continue;
      }

      // Test failure line
      if (line.includes('[FAIL]') || line.includes('Failed ')) {
        if (currentTestError && currentTestError.message) {
          errors.push(currentTestError as ErrorDetail);
        }
        currentTestError = {
          message: line.replace(/.*\[FAIL\]\s*/, '').trim()
        };
        inTestFail = true;
        continue;
      }

      if (inTestFail && currentTestError) {
        if (line.includes('Expected:')) {
          currentTestError.expected = line.replace(/.*Expected:\s*/, '').trim();
        } else if (line.includes('Actual:') || line.includes('Received:')) {
          currentTestError.received = line.replace(/.*(?:Actual|Received):\s*/, '').trim();
        } else if (line.match(/at\s+.*in\s+([^:]+):line\s+(\d+)/)) {
          const stackMatch = line.match(/at\s+.*in\s+([^:]+):line\s+(\d+)/);
          if (stackMatch) {
            currentTestError.file = stackMatch[1].trim();
            currentTestError.line = parseInt(stackMatch[2], 10);
          }
        }
      }
    }

    if (currentTestError && currentTestError.message) {
      errors.push(currentTestError as ErrorDetail);
    }

    if (errors.length === 0 && exitCode !== 0) {
      errors.push({
        message: lines.slice(0, 3).join('\n') || '.NET execution failed'
      });
    }

    return {
      summary: `${errors.length} .NET error${errors.length === 1 ? '' : 's'} isolated`,
      errors,
      highlights: Array.from(filesWithErrors).map(f => `File: ${f}`)
    };
  }
}
