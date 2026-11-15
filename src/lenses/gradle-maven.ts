import { SemanticLens } from './lens.interface.js';
import { LensProcessResult, ErrorDetail } from '../types.js';

export class GradleMavenLens implements SemanticLens {
  public readonly name = 'gradle-maven';
  public readonly description = 'Java & Kotlin build tools (Gradle, Gradle Wrapper, Maven, javac)';

  public canHandle(command: string, sampleLines: string[]): boolean {
    const cmd = command.toLowerCase();
    if (
      cmd.includes('gradle') ||
      cmd.includes('mvn') ||
      cmd.includes('gradlew') ||
      cmd.includes('javac')
    ) {
      return true;
    }

    return sampleLines.some(line =>
      line.includes('BUILD FAILED') ||
      line.includes('BUILD FAILURE') ||
      line.match(/> Task :\S+ FAILED/) ||
      line.match(/\[ERROR\]\s+.*?\.(?:java|kt):\[\d+,\d+\]/)
    );
  }

  public process(lines: string[], exitCode: number): LensProcessResult {
    const errors: ErrorDetail[] = [];
    const highlights: string[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 1. Maven compiler error: [ERROR] /path/to/File.java:[42,15] cannot find symbol
      const mavenMatch = line.match(/\[ERROR\]\s+((?:[a-zA-Z]:[\\/])?[^:\[\r\n]+\.(?:java|kt)):\[(\d+),(\d+)\]\s+(?:error:\s*)?(.+)$/i);
      if (mavenMatch) {
        const file = mavenMatch[1].trim();
        const lineNum = parseInt(mavenMatch[2], 10);
        const colNum = parseInt(mavenMatch[3], 10);
        let msg = mavenMatch[4].trim();
        const snippetLines: string[] = [];

        i++;
        while (i < lines.length && lines[i].startsWith('[ERROR]')) {
          const sub = lines[i].replace(/^\[ERROR\]\s*/, '');
          if (sub.includes(':[')) break; // next error
          if (sub.startsWith('symbol:') || sub.startsWith('location:')) {
            msg += ` (${sub.trim()})`;
          } else if (sub.match(/^\s*\^/)) {
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

      // 2. Gradle / javac compiler error: /path/to/File.java:42: error: cannot find symbol
      const gradleMatch = line.match(/^((?:[a-zA-Z]:[\\/])?[^:\r\n]+\.(?:java|kt)):(\d+):\s+(?:error:\s*)?(.+)$/i);
      if (gradleMatch) {
        const file = gradleMatch[1].trim();
        const lineNum = parseInt(gradleMatch[2], 10);
        let msg = gradleMatch[3].trim();
        const snippetLines: string[] = [];

        i++;
        while (i < lines.length && !lines[i].match(/^((?:[a-zA-Z]:[\\/])?[^:\r\n]+\.(?:java|kt)):(\d+):/)) {
          const sub = lines[i];
          if (sub.startsWith('>') || sub.includes('BUILD FAILED')) break;
          if (sub.trim().startsWith('symbol:') || sub.trim().startsWith('location:')) {
            msg += ` (${sub.trim()})`;
          } else if (sub.includes('^')) {
            snippetLines.push(sub);
          }
          i++;
        }

        errors.push({
          file,
          line: lineNum,
          message: msg,
          snippet: snippetLines.length > 0 ? snippetLines.join('\n') : undefined
        });
        continue;
      }

      // 3. Gradle test assertion failure: ClassTest > testMethod FAILED
      const testMatch = line.match(/^(\S+)\s*>\s*(\S+)\s+FAILED/);
      if (testMatch) {
        const testClass = testMatch[1];
        const testMethod = testMatch[2];
        let msg = `Test failed: ${testClass} > ${testMethod}`;
        let expectedVal: string | undefined;
        let receivedVal: string | undefined;

        i++;
        while (i < lines.length && !lines[i].match(/^\S+\s*>\s*\S+\s+FAILED/)) {
          const sub = lines[i];
          if (sub.startsWith('>') || sub.includes('BUILD FAILED')) break;

          const assertionMatch = sub.match(/expected:\s*<([^>]+)>\s*but was:\s*<([^>]+)>/i);
          if (assertionMatch) {
            expectedVal = assertionMatch[1];
            receivedVal = assertionMatch[2];
            msg = `Assertion error in ${testMethod}: expected <${expectedVal}> but was <${receivedVal}>`;
          }
          i++;
        }

        errors.push({
          message: msg,
          expected: expectedVal,
          received: receivedVal
        });
        continue;
      }

      // Failed Task highlight
      const taskMatch = line.match(/^>\s+Task\s+(:\S+)\s+FAILED/);
      if (taskMatch) {
        highlights.push(`Failed Task: ${taskMatch[1]}`);
      }

      i++;
    }

    if (errors.length === 0 && exitCode !== 0) {
      return {
        summary: 'JVM build failed, but no specific compiler or test diagnostics were isolated.',
        errors: [{ message: 'Build failed with exit code ' + exitCode }],
        highlights
      };
    }

    const summary = exitCode === 0
      ? 'Java/Kotlin build completed successfully.'
      : `${errors.length} build diagnostic${errors.length === 1 ? '' : 's'} isolated across Gradle/Maven execution.`;

    return {
      summary,
      errors,
      highlights,
      suggestedAction: errors.length > 0 ? 'Fix the isolated compiler errors or broken unit tests.' : undefined
    };
  }
}
