import { ErrorDetail, RemediationPlan } from '../types.js';

export class RemediationEngine {
  /**
   * Analyzes an error detail or group of errors and synthesizes high-confidence remediation plans.
   */
  public analyze(errors: ErrorDetail[], command: string = ''): RemediationPlan[] {
    const plans: RemediationPlan[] = [];
    const seenCategories = new Set<string>();

    for (const err of errors) {
      const msg = err.message || '';
      const code = err.code || '';
      const combined = `${code} ${msg} ${err.snippet || ''}`;

      // 1. Missing Node/JS Dependency
      const nodeModuleMatch = combined.match(/Cannot find module ['"]([^'"]+)['"]/i)
        || combined.match(/Cannot find package ['"]([^'"]+)['"]/i)
        || combined.match(/Module not found: Can't resolve ['"]([^'"]+)['"]/i);
      if (nodeModuleMatch && !seenCategories.has('MISSING_DEPENDENCY')) {
        const mod = nodeModuleMatch[1];
        const isTypePackage = mod.startsWith('@types/');
        const cmd = isTypePackage ? `npm install -D ${mod}` : `npm install ${mod}`;
        plans.push({
          category: 'MISSING_DEPENDENCY',
          confidence: 'high',
          title: `Missing module dependency: '${mod}'`,
          explanation: `The runtime could not locate package '${mod}'. Installing it locally should resolve the import error.`,
          suggestedCommand: cmd,
          patchHypothesis: `Run \`${cmd}\` and ensure '${mod}' is declared in package.json.`
        });
        seenCategories.add('MISSING_DEPENDENCY');
      }

      // 2. Missing Python Dependency
      const pyModuleMatch = combined.match(/ModuleNotFoundError: No module named ['"]([^'"]+)['"]/i);
      if (pyModuleMatch && !seenCategories.has('MISSING_PYTHON_PACKAGE')) {
        const mod = pyModuleMatch[1];
        plans.push({
          category: 'MISSING_PYTHON_PACKAGE',
          confidence: 'high',
          title: `Missing Python module: '${mod}'`,
          explanation: `Python failed to import module '${mod}'. Ensure it is installed in your active virtual environment.`,
          suggestedCommand: `pip install ${mod}`,
          patchHypothesis: `Install with \`pip install ${mod}\` or add to requirements.txt.`
        });
        seenCategories.add('MISSING_PYTHON_PACKAGE');
      }

      // 3. Go Module Tidy
      if ((combined.includes('no required module provides package') || combined.includes('cannot find package')) && command.includes('go')) {
        if (!seenCategories.has('GO_MODULE_SYNC')) {
          plans.push({
            category: 'GO_MODULE_SYNC',
            confidence: 'high',
            title: 'Unsynchronized Go modules',
            explanation: 'Go dependencies are missing or out of sync with go.mod/go.sum.',
            suggestedCommand: 'go mod tidy',
            patchHypothesis: 'Run `go mod tidy` to download missing modules and sync go.sum.'
          });
          seenCategories.add('GO_MODULE_SYNC');
        }
      }

      // 4. TypeScript Type Mismatch (TS2322 / TS2345)
      if (code === 'TS2322' || code === 'TS2345' || combined.includes('is not assignable to type')) {
        if (!seenCategories.has('TYPE_MISMATCH')) {
          const typeMatch = combined.match(/Type ['"]([^'"]+)['"] is not assignable to type ['"]([^'"]+)['"]/i);
          const fromType = typeMatch ? typeMatch[1] : 'source type';
          const toType = typeMatch ? typeMatch[2] : 'target type';
          plans.push({
            category: 'TYPE_MISMATCH',
            confidence: 'high',
            title: `Type mismatch (${fromType} ➔ ${toType})`,
            explanation: `Type '${fromType}' cannot be assigned to '${toType}'.`,
            patchHypothesis: err.file && err.line
              ? `Inspect \`${err.file}:${err.line}\` and ensure explicit type casting or adjust expected signature to accept '${fromType}'.`
              : `Convert '${fromType}' to '${toType}' or update type contract.`
          });
          seenCategories.add('TYPE_MISMATCH');
        }
      }

      // 5. TypeScript Missing Property (TS2339)
      if (code === 'TS2339' || combined.includes('does not exist on type')) {
        if (!seenCategories.has('PROPERTY_MISSING')) {
          const propMatch = combined.match(/Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/i);
          const prop = propMatch ? propMatch[1] : 'property';
          const typeName = propMatch ? propMatch[2] : 'type';
          plans.push({
            category: 'PROPERTY_MISSING',
            confidence: 'high',
            title: `Missing property '${prop}' on '${typeName}'`,
            explanation: `Accessing '${prop}' failed because '${typeName}' does not declare this field.`,
            patchHypothesis: `Add optional chaining (\`obj?.${prop}\`) or declare '${prop}' on interface '${typeName}'.`
          });
          seenCategories.add('PROPERTY_MISSING');
        }
      }

      // 6. Test Assertion Failure
      if (err.expected !== undefined && err.received !== undefined) {
        if (!seenCategories.has('ASSERTION_FAILURE')) {
          plans.push({
            category: 'ASSERTION_FAILURE',
            confidence: 'high',
            title: `Assertion discrepancy: expected ${err.expected}, got ${err.received}`,
            explanation: `The test assertion failed because received value did not match expected value.`,
            patchHypothesis: err.file && err.line
              ? `Inspect logic in \`${err.file}:${err.line}\`. If the new behavior is correct, update the test assertion; otherwise fix the output generator.`
              : `Reconcile expected value (${err.expected}) with actual computation (${err.received}).`
          });
          seenCategories.add('ASSERTION_FAILURE');
        }
      }

      // 7. Linter Auto-Fixable Violations
      if (command.includes('eslint') || command.includes('biome') || command.includes('ruff')) {
        if (!seenCategories.has('LINT_AUTOFIX')) {
          let fixCmd = 'npx eslint --fix .';
          if (command.includes('biome')) fixCmd = 'npx @biomejs/biome check --write .';
          if (command.includes('ruff')) fixCmd = 'ruff check --fix .';
          plans.push({
            category: 'LINT_AUTOFIX',
            confidence: 'high',
            title: 'Linter violations detected',
            explanation: 'Code style or syntactic violations may be automatically repairable.',
            suggestedCommand: fixCmd,
            patchHypothesis: `Execute \`${fixCmd}\` to auto-resolve format and lint violations.`
          });
          seenCategories.add('LINT_AUTOFIX');
        }
      }

      // 8. Port in Use (EADDRINUSE)
      if (combined.includes('EADDRINUSE') || combined.includes('address already in use')) {
        if (!seenCategories.has('PORT_IN_USE')) {
          const portMatch = combined.match(/(?:port|:::|:)(\d{2,5})/i);
          const port = portMatch ? portMatch[1] : '<PORT>';
          const findCmd = process.platform === 'win32' ? `netstat -ano | findstr :${port}` : `lsof -i :${port}`;
          plans.push({
            category: 'PORT_IN_USE',
            confidence: 'high',
            title: `Port collision (EADDRINUSE${port !== '<PORT>' ? ` on port ${port}` : ''})`,
            explanation: `The requested network port ${port !== '<PORT>' ? port : ''} is currently occupied by another active process.`,
            suggestedCommand: findCmd,
            patchHypothesis: `Terminate the existing process using port ${port} or run with an alternate port flag (e.g. PORT=3001).`
          });
          seenCategories.add('PORT_IN_USE');
        }
      }

      // 9. Node Out of Memory
      if (combined.includes('heap out of memory') || combined.includes('Allocation failed - JavaScript heap')) {
        if (!seenCategories.has('OUT_OF_MEMORY')) {
          plans.push({
            category: 'OUT_OF_MEMORY',
            confidence: 'high',
            title: 'Node.js V8 heap memory exhaustion',
            explanation: 'The Node process exceeded default memory ceiling during build or test execution.',
            suggestedCommand: 'export NODE_OPTIONS="--max-old-space-size=4096"',
            patchHypothesis: 'Increase heap limit via NODE_OPTIONS="--max-old-space-size=4096" or inspect for memory leaks.'
          });
          seenCategories.add('OUT_OF_MEMORY');
        }
      }
    }

    return plans;
  }
}
