import { SemanticLens } from './lens.interface.js';
import { JestVitestLens } from './jest.js';
import { PytestLens } from './pytest.js';
import { TscLens } from './tsc.js';
import { CargoLens } from './cargo.js';
import { DockerLens } from './docker.js';
import { GolangLens } from './golang.js';
import { PythonLintLens } from './python-lint.js';
import { JsLintLens } from './js-lint.js';
import { ClangLens } from './clang.js';
import { DotnetLens } from './dotnet.js';
import { CustomLens } from './custom.js';
import { GenericLens } from './generic.js';
import { CustomLensDef } from '../config.js';

export { SemanticLens } from './lens.interface.js';
export { JestVitestLens } from './jest.js';
export { PytestLens } from './pytest.js';
export { TscLens } from './tsc.js';
export { CargoLens } from './cargo.js';
export { DockerLens } from './docker.js';
export { GolangLens } from './golang.js';
export { PythonLintLens } from './python-lint.js';
export { JsLintLens } from './js-lint.js';
export { ClangLens } from './clang.js';
export { DotnetLens } from './dotnet.js';
export { CustomLens } from './custom.js';
export { GenericLens } from './generic.js';

export class LensRegistry {
  private lenses: SemanticLens[] = [];
  private fallbackLens: SemanticLens;

  constructor(customDefs: CustomLensDef[] = []) {
    this.fallbackLens = new GenericLens();

    // Register user-defined custom lenses first (highest priority)
    for (const def of customDefs) {
      try {
        this.lenses.push(new CustomLens(def));
      } catch {
        // Skip invalid regexes gracefully
      }
    }

    // Specialized built-in ecosystem lenses
    this.lenses.push(
      new JestVitestLens(),
      new PytestLens(),
      new TscLens(),
      new GolangLens(),
      new PythonLintLens(),
      new JsLintLens(),
      new ClangLens(),
      new DotnetLens(),
      new CargoLens(),
      new DockerLens()
    );
  }

  public register(lens: SemanticLens): void {
    this.lenses.unshift(lens);
  }

  public getLens(nameOrAuto: string | undefined, command: string, sampleLines: string[]): SemanticLens {
    if (nameOrAuto && nameOrAuto !== 'auto') {
      const match = this.lenses.find(l => l.name.toLowerCase() === nameOrAuto.toLowerCase());
      if (match) return match;
      if (this.fallbackLens.name.toLowerCase() === nameOrAuto.toLowerCase()) {
        return this.fallbackLens;
      }
    }

    for (const lens of this.lenses) {
      if (lens.canHandle(command, sampleLines)) {
        return lens;
      }
    }

    return this.fallbackLens;
  }

  public listLenses(): { name: string; description: string }[] {
    return [
      ...this.lenses.map(l => ({ name: l.name, description: l.description })),
      { name: this.fallbackLens.name, description: this.fallbackLens.description }
    ];
  }
}
