import { SemanticLens } from './lens.interface.js';
import { JestVitestLens } from './jest.js';
import { PytestLens } from './pytest.js';
import { TscLens } from './tsc.js';
import { CargoLens } from './cargo.js';
import { DockerLens } from './docker.js';
import { GenericLens } from './generic.js';

export { SemanticLens } from './lens.interface.js';
export { JestVitestLens } from './jest.js';
export { PytestLens } from './pytest.js';
export { TscLens } from './tsc.js';
export { CargoLens } from './cargo.js';
export { DockerLens } from './docker.js';
export { GenericLens } from './generic.js';

export class LensRegistry {
  private lenses: SemanticLens[] = [];
  private fallbackLens: SemanticLens;

  constructor() {
    this.fallbackLens = new GenericLens();
    // Order matters: specialized lenses are evaluated before generic fallback
    this.lenses = [
      new JestVitestLens(),
      new PytestLens(),
      new TscLens(),
      new CargoLens(),
      new DockerLens()
    ];
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
