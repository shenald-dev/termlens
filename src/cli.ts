import { TermlensEngine } from './engine.js';
import { LensRegistry } from './lenses/index.js';
import { runMcpServer } from './mcp/server.js';
import { TermlensOptions } from './types.js';

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const registry = new LensRegistry();
  const engine = new TermlensEngine(registry);

  // Strip 'node' and script path
  const rawArgs = argv.slice(2);

  // Check for MCP flag
  if (rawArgs.includes('--mcp')) {
    await runMcpServer(engine);
    return;
  }

  // Check for standalone --list-lenses
  if (rawArgs.length === 1 && rawArgs[0] === '--list-lenses') {
    console.log('\n🔍 Registered termlens Semantic Lenses:');
    console.log('────────────────────────────────────────────────────────────');
    for (const l of registry.listLenses()) {
      console.log(`  • ${l.name.padEnd(10)} ── ${l.description}`);
    }
    console.log('');
    process.exit(0);
  }

  // Parse termlens-specific options and separate from child command
  let agentMode = false;
  let jsonMode = false;
  let rawMode = false;
  let explicitLens: string | undefined;
  let tailLines = 8;
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
      if (arg === '--raw') {
        rawMode = true;
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
          console.log('termlens v0.1.0');
          process.exit(0);
        }
      }
      if (arg === '--help' || arg === '-h') {
        if (childArgs.length === 0) {
          printHelp(registry);
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
        const result = engine.compactText(pipedInput, explicitLens, 'piped_input');
        if (jsonMode) {
          console.log(result.jsonFormatted);
        } else if (agentMode) {
          console.log(result.agentFormatted);
        } else {
          console.log(result.humanFormatted);
        }
        process.exit(result.exitCode);
      }
    }

    printHelp(registry);
    process.exit(0);
  }

  const fullCommand = childArgs.join(' ');

  const executionOptions: TermlensOptions = {
    agentMode,
    jsonMode,
    rawMode,
    lens: explicitLens,
    tailLines
  };

  const result = await engine.execute(fullCommand, executionOptions);

  if (rawMode) {
    for (const line of result.rawTail) {
      console.log(line);
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

function printHelp(registry: LensRegistry) {
  console.log(`
🔍 termlens v0.1.0
Zero-Token Terminal Compactor & Semantic Error Lens for Developers and AI Agents

Usage:
  termlens [options] <command...>
  cat noisy.log | termlens [options]

Examples:
  termlens npm test
  termlens --agent pytest tests/
  termlens -j tsc --noEmit
  termlens --lens jest npm run test:ci
  termlens --mcp

Options:
  -a, --agent          Format output as ultra-compact Markdown for AI agent prompts
  -j, --json           Format output as structured JSON
  -l, --lens <name>    Explicitly specify a lens (jest, pytest, tsc, cargo, docker, generic)
  --tail <lines>       Number of raw tail lines to retain in output (default: 8)
  --raw                Pass through uncompressed output (dry/debug mode)
  --mcp                Start the Model Context Protocol (MCP) stdio server
  --list-lenses        List all registered semantic lenses
  -v, --version        Display current version
  -h, --help           Display this help manual
`);
}
