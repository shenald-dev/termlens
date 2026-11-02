# Contributing to termlens

Thank you for your interest in contributing to **termlens**! We welcome bug reports, feature requests, documentation improvements, and new semantic lenses.

## Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/shenald-dev/termlens.git
   cd termlens
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build TypeScript**:
   ```bash
   npm run build
   ```

4. **Run automated test suite**:
   ```bash
   npm test
   ```

## Creating a New Semantic Lens

`termlens` is architected with a modular plug-and-play lens design. To add a new lens (e.g., `golang`, `gradle`, `eslint`, `rubocop`):

1. Create `src/lenses/<name>.ts` implementing the `SemanticLens` interface:
   ```typescript
   import { SemanticLens } from './lens.interface.js';
   import { LensProcessResult, ErrorDetail } from '../types.js';

   export class MyNewLens implements SemanticLens {
     readonly name = 'mytool';
     readonly description = 'Semantic lens for MyTool';

     canHandle(command: string, sampleLines: string[]): boolean {
       return command.includes('mytool') || sampleLines.some(l => l.includes('MYTOOL_SIG'));
     }

     process(lines: string[], exitCode: number): LensProcessResult {
       // Filter noise, isolate failures
       return {
         summary: 'Extracted summary',
         errors: [/* ErrorDetail items */]
       };
     }
   }
   ```

2. Register the lens in `src/lenses/index.ts`.
3. Add a test in `tests/lenses.test.js` verifying failure extraction and token reduction.
4. Run `npm test` to ensure 100% pass rate.

## Pull Request Guidelines

- Ensure `npm run lint` and `npm test` pass with zero errors.
- Keep dependencies minimal (prefer zero runtime external dependencies).
- Include unit tests for any new parser logic or lenses.
