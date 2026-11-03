import fs from 'node:fs';
import path from 'node:path';
import { TermlensEngine } from './engine.js';
import { LensRegistry } from './lenses/index.js';
import { runMcpServer } from './mcp/server.js';
import { loadConfig, generateStarterConfig } from './config.js';
import { TermlensOptions } from './types.js';

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const config = loadConfig();
  const registry = new LensRegistry(config.customLenses);
  const engine = new TermlensEngine(registry);

  // Strip 'node' and script path
  const rawArgs = argv.slice(2);

  // Check for MCP flag
  if (rawArgs.includes('--mcp')) {
    await runMcpServer(engine, registry);
    return;
  }

  // Check for --init
  if (rawArgs.includes('--init')) {
    const configPath = path.join(process.cwd(), 'termlens.config.json');
    const force = rawArgs.includes('--force');
    if (fs.existsSync(configPath) && !force) {
      console.log(`⚠️ Configuration file already exists at ${configPath}`);
      console.log('Use --force to overwrite.');
      process.exit(0);
    }
    fs.writeFileSync(configPath, generateStarterConfig(), 'utf-8');
    console.log(`✓ Scaffolded starter configuration: ${configPath}`);
    process.exit(0);
  }

  // Check for standalone --list-lenses
  if (rawArgs.length === 1 && rawArgs[0] === '--list-lenses') {
    console.log('\n🔍 Registered termlens Semantic Lenses:');
    console.log('────────────────────────────────────────────────────────────');
    for (const l of registry.listLenses()) {
      console.log(`  • ${l.name.padEnd(14)} ── ${l.description}`);
    }
    console.log('');
    process.exit(0);
  }

  // Parse termlens-specific options and separate from child command
  let agentMode = false;
  let jsonMode = false;
  let rawMode = false;
  let ciMode = Boolean(config.ciAnnotations || process.env.GITHUB_ACTIONS === 'true');
  let quietSuccess = Boolean(config.quietSuccess);
  let explicitLens: string | undefined = config.defaultLens;
  let tailLines = config.tailLines ?? 8;
  let maxErrors = config.maxErrors ?? 8;
  let noCluster = config.clusterErrors === false;
  let outputFile: string | undefined;
  const childArgs: string[] = [];

  let isChildCommand = false;

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];

    if (!isChildCommand) {
      if (arg === '--agent' || arg === '-a') {
        agentMode = true;
        continue;
      }
      if (arg === '--json' || arg === '-j') {
        jsonMode = true;
        continue;
      }
      if (arg === '--quiet-success' || arg === '-q' || arg === '--silent-success') {
        quietSuccess = true;
        continue;
      }
      if (arg === '--ci') {
        ciMode = true;
        continue;
      }
      if (arg === '--raw') {
        rawMode = true;
        continue;
      }
      if (arg === '--no-cluster') {
        noCluster = true;
        continue;
      }
      if (arg === '--output' || arg === '-o') {
        outputFile = rawArgs[++i];
        continue;
      }
      if (arg === '--max-errors') {
        maxErrors = parseInt(rawArgs[++i] || '8', 10);
        continue;
      }
      if (arg === '--lens' || arg === '-l') {
        explicitLens = rawArgs[++i];
        continue;
      }
      if (arg === '--tail') {
        tailLines = parseInt(rawArgs[++i] || '8', 10);
        continue;
      }
      if (arg === '--version' || arg === '-v') {
        if (childArgs.length === 0) {
          console.log('termlens v0.2.0');
          process.exit(0);
        }
      }
      if (arg === '--help' || arg === '-h') {
        if (childArgs.length === 0) {
          printHelp();
          process.exit(0);
        }
      }
      if (arg === '--') {
        // Explicit delimiter: everything after '--' is child command
        isChildCommand = true;
        continue;
      }

      // First argument that isn't a termlens flag starts the child command!
      isChildCommand = true;
      childArgs.push(arg);
    } else {
      childArgs.push(arg);
    }
  }

  // Handle stdin piping if no child command was given
  if (childArgs.length === 0) {
    if (!process.stdin.isTTY) {
      let pipedInput = '';
      for await (const chunk of process.stdin) {
        pipedInput += chunk.toString('utf-8');
      }

      if (pipedInput.trim().length > 0) {
        const result = engine.compactText(pipedInput, explicitLens, 'piped_input', {
          agentMode,
          jsonMode,
          quietSuccess,
          maxErrors,
          noCluster,
          outputFile
        });

        if (ciMode && result.ciFormatted) {
          console.log(result.ciFormatted);
        } else if (jsonMode) {
          console.log(result.jsonFormatted);
        } else if (agentMode) {
          console.log(result.agentFormatted);
        } else {
          console.log(result.humanFormatted);
        }
        process.exit(result.exitCode);
      }
    }

    printHelp();
    process.exit(0);
  }

  const fullCommand = childArgs.join(' ');

  const executionOptions: TermlensOptions = {
    agentMode,
    jsonMode,
    rawMode,
    ciMode,
    quietSuccess,
    lens: explicitLens,
    tailLines,
    maxErrors,
    noCluster,
    outputFile
  };

  const result = await engine.execute(fullCommand, executionOptions);

  if (rawMode) {
    for (const line of result.rawTail) {
      console.log(line);
    }
  } else if (ciMode && result.ciFormatted) {
    console.log(result.ciFormatted);
    if (!jsonMode && !agentMode) {
      console.log('\n' + result.humanFormatted);
    }
  } else if (jsonMode) {
    console.log(result.jsonFormatted);
  } else if (agentMode) {
    console.log(result.agentFormatted);
  } else {
    console.log(result.humanFormatted);
  }

  process.exit(result.exitCode);
}

function printHelp() {
  console.log(`
🔍 termlens v0.2.0
Zero-Token Terminal Compactor & Semantic Error Lens for Developers and AI Agents

Usage:
  termlens [options] <command...>
  cat noisy.log | termlens [options]

Examples:
  termlens npm test
  termlens -a pytest tests/
  termlens -q go test ./...
  termlens -j tsc --noEmit
  termlens --ci cargo test
  termlens --lens jest npm run test:ci
  termlens --init
  termlens --mcp

Options:
  -a, --agent          Format output as ultra-compact Markdown for AI agent prompts
  -j, --json           Format output as structured JSON
  -q, --quiet-success  Suppress output on exit 0 (zero tokens for AI agents on green runs)
  --ci                 Output GitHub Actions workflow commands (::error file=...::...)
  -l, --lens <name>    Explicitly specify a lens (jest, pytest, tsc, go, python-lint,
                       js-lint, clang, dotnet, cargo, docker, generic)
  -o, --output <file>  Write formatted output to a file
  --tail <lines>       Number of raw tail lines to retain in output (default: 8)
  --max-errors <n>     Max errors to display before clustering (default: 8)
  --no-cluster         Disable error deduplication and clustering
  --init               Scaffold a termlens.config.json configuration file
  --raw                Pass through uncompressed output (dry/debug mode)
  --mcp                Start the Model Context Protocol (MCP) stdio server
  --list-lenses        List all registered semantic lenses
  -v, --version        Display current version
  -h, --help           Display this help manual
`);
}
