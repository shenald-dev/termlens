import * as readline from 'node:readline';
import { TermlensEngine } from '../engine.js';
import { LensRegistry } from '../lenses/index.js';
import { diffFlights } from '../flight/diff.js';
import { ErrorDetail } from '../types.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Runs an in-process Model Context Protocol (MCP) server over standard input/output.
 * Compatible with Claude Code, Cursor, Codex, Antigravity, and all MCP-compliant tools.
 */
export async function runMcpServer(engine: TermlensEngine, registry?: LensRegistry): Promise<void> {
  const activeRegistry = registry || engine.getRegistry() || new LensRegistry();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (res: JsonRpcResponse) => {
    process.stdout.write(JSON.stringify(res) + '\n');
  };

  rl.on('close', () => {
    process.exit(0);
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(trimmed);
    } catch {
      sendResponse({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' }
      });
      return;
    }

    const { id, method, params } = req;

    // MCP lifecycle: initialize
    if (method === 'initialize') {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'termlens',
            version: '0.3.0'
          },
          capabilities: {
            tools: {},
            prompts: {},
            resources: {}
          }
        }
      });
      return;
    }

    // MCP notification: notifications/initialized
    if (method === 'notifications/initialized' || method === 'initialized') {
      return;
    }

    // MCP lifecycle: ping
    if (method === 'ping') {
      sendResponse({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    // MCP resources discovery: resources/list
    if (method === 'resources/list') {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: 'termlens://flights/latest',
              name: 'Latest Flight Recording',
              description: 'Telemetry, isolated errors, and duration for the most recent command execution.',
              mimeType: 'application/json'
            },
            {
              uri: 'termlens://lenses',
              name: 'Registered Semantic Lenses',
              description: 'List of all built-in and user-defined lenses supported by termlens.',
              mimeType: 'application/json'
            }
          ]
        }
      });
      return;
    }

    // MCP resource reading: resources/read
    if (method === 'resources/read') {
      const uri = String((params as { uri?: string })?.uri || '');
      const recorder = engine.getFlightRecorder();

      if (uri === 'termlens://flights/latest') {
        const latest = recorder.getLatest();
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(latest || { status: 'none', message: 'No recorded flights yet' }, null, 2)
              }
            ]
          }
        });
        return;
      }

      if (uri.startsWith('termlens://flights/')) {
        const flightId = uri.replace('termlens://flights/', '');
        const flight = recorder.get(flightId);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(flight || { error: 'Flight not found' }, null, 2)
              }
            ]
          }
        });
        return;
      }

      if (uri === 'termlens://lenses') {
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(activeRegistry.listLenses(), null, 2)
              }
            ]
          }
        });
        return;
      }

      sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Resource not found: ${uri}` }
      });
      return;
    }

    // MCP prompts discovery: prompts/list
    if (method === 'prompts/list') {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          prompts: [
            {
              name: 'fix_terminal_error',
              description: 'Generates a focused bug-fix prompt based on isolated termlens failures.',
              arguments: [
                {
                  name: 'command',
                  description: 'The command that failed',
                  required: true
                }
              ]
            },
            {
              name: 'diff_runs',
              description: 'Compares two execution runs or flight recordings to pinpoint newly introduced regressions.',
              arguments: [
                {
                  name: 'baseFlightId',
                  description: 'The baseline flight ID or "latest"',
                  required: true
                },
                {
                  name: 'targetFlightId',
                  description: 'The target flight ID to compare against',
                  required: true
                }
              ]
            }
          ]
        }
      });
      return;
    }

    // MCP prompts discovery: prompts/get
    if (method === 'prompts/get') {
      const promptName = (params as { name?: string })?.name;
      const args = (params as { arguments?: Record<string, unknown> })?.arguments || {};
      const recorder = engine.getFlightRecorder();

      if (promptName === 'fix_terminal_error') {
        const command = String(args.command || '');
        const error = args.error ? String(args.error) : undefined;
        const file = args.file ? String(args.file) : undefined;
        const line = typeof args.line === 'number' ? args.line : (args.line ? parseInt(String(args.line), 10) : undefined);
        const snippet = args.snippet ? String(args.snippet) : undefined;

        let errorDetails: ErrorDetail[] = [{ message: error || 'Command execution failed', file, line, snippet }];
        const latest = recorder.getLatest();

        if (!error && latest && latest.errors.length > 0) {
          errorDetails = latest.errors;
        }

        const remediations = engine.getRemediationEngine().analyze(errorDetails, command);
        const promptLines = [
          `The terminal command \`${command || (latest ? latest.command : 'unknown')}\` failed.`,
          '',
          '### Failure Context:',
          ...errorDetails.map((e, idx) => `${idx + 1}. ${e.file ? `\`${e.file}${e.line ? `:${e.line}` : ''}\`: ` : ''}${e.message}`)
        ];

        if (remediations.length > 0) {
          promptLines.push('', '### Suggested Remediation:');
          for (const rem of remediations) {
            promptLines.push(`- **${rem.title}**: ${rem.explanation}`);
            if (rem.suggestedCommand) promptLines.push(`  Command: \`${rem.suggestedCommand}\``);
            if (rem.patchHypothesis) promptLines.push(`  Patch: ${rem.patchHypothesis}`);
          }
        }

        promptLines.push(
          '',
          'Please inspect the failure and propose the minimal correct patch to fix the error.'
        );

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            description: 'Fix terminal failure prompt',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: promptLines.join('\n')
                }
              }
            ]
          }
        });
        return;
      }

      if (promptName === 'diff_runs') {
        const baseId = String(args.baseFlightId || 'latest');
        const targetId = String(args.targetFlightId || 'latest');

        const baseFlight = baseId === 'latest' ? recorder.getLatest() : recorder.get(baseId);
        const targetFlight = targetId === 'latest' ? recorder.getLatest() : recorder.get(targetId);

        if (!baseFlight || !targetFlight) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Could not locate flight records: ${baseId}, ${targetId}`
            }
          });
          return;
        }

        const diff = diffFlights(baseFlight, targetFlight);
        const promptLines = [
          `### Semantic Run Comparison: \`${baseFlight.id}\` ➔ \`${targetFlight.id}\``,
          diff.markdown,
          '',
          'Please analyze the resolved failures versus any new/regressed failures above and verify that no unintended regressions were introduced.'
        ];

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            description: 'Run comparison and regression analysis prompt',
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: promptLines.join('\n')
                }
              }
            ]
          }
        });
        return;
      }

      sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Prompt not found: ${promptName}` }
      });
      return;
    }

    // MCP tool discovery: tools/list
    if (method === 'tools/list') {
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'termlens_exec',
              description: 'Executes a shell command with automatic token-compaction, stripping 90%+ terminal noise while isolating actionable failures for LLMs.',
              inputSchema: {
                type: 'object',
                properties: {
                  command: {
                    type: 'string',
                    description: 'The shell command to execute (e.g. npm test, pytest, go test, tsc, cargo test)'
                  },
                  lens: {
                    type: 'string',
                    description: 'Optional explicit lens to apply: node-test, jest, pytest, tsc, bundler, go, python-lint, js-lint, clang, dotnet, gradle-maven, cargo, docker, generic (default: auto)'
                  },
                  cwd: {
                    type: 'string',
                    description: 'Optional working directory'
                  },
                  timeoutMs: {
                    type: 'number',
                    description: 'Optional execution timeout in milliseconds (default: 60000)'
                  },
                  quietSuccess: {
                    type: 'boolean',
                    description: 'If true, emits zero-overhead minimal confirmation on exit code 0, saving 100% of tokens on passing runs'
                  },
                  maxErrors: {
                    type: 'number',
                    description: 'Maximum number of errors to report before clustering (default: 8)'
                  },
                  diffWithLast: {
                    type: 'boolean',
                    description: 'If true, semantically diffs the current run against the preceding flight recording'
                  },
                  enrichSource: {
                    type: 'boolean',
                    description: 'If true (default), enriches errors with local source code snippets'
                  }
                },
                required: ['command']
              }
            },
            {
              name: 'termlens_compact',
              description: 'Compacts an existing noisy terminal text or log block, stripping ANSI noise and clustering errors into an ultra-dense format.',
              inputSchema: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: 'The raw terminal output or log text to compact'
                  },
                  lens: {
                    type: 'string',
                    description: 'Optional lens to apply: node-test, jest, pytest, tsc, bundler, go, python-lint, js-lint, clang, dotnet, gradle-maven, cargo, docker, generic'
                  },
                  quietSuccess: {
                    type: 'boolean',
                    description: 'If true, produces minimal output on passing runs'
                  },
                  enrichSource: {
                    type: 'boolean',
                    description: 'If true, enriches errors with local source code context'
                  }
                },
                required: ['text']
              }
            },
            {
              name: 'termlens_suggest_fix',
              description: 'Synthesizes autonomous diagnostic and remediation recipes for isolated terminal errors, including auto-fix commands and patch hypotheses.',
              inputSchema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                    description: 'The error message or failure summary'
                  },
                  command: {
                    type: 'string',
                    description: 'The command that failed (e.g. npm test, go test, tsc)'
                  },
                  file: {
                    type: 'string',
                    description: 'The failing file path if known'
                  },
                  line: {
                    type: 'number',
                    description: 'The line number of the failure'
                  },
                  snippet: {
                    type: 'string',
                    description: 'The source code snippet around the failure'
                  }
                },
                required: ['error']
              }
            },
            {
              name: 'termlens_diff',
              description: 'Semantically compares two flight runs to report resolved errors, new regressions, and persistent failures.',
              inputSchema: {
                type: 'object',
                properties: {
                  baseFlightId: {
                    type: 'string',
                    description: 'The baseline flight ID (or "latest" for most recent)'
                  },
                  targetFlightId: {
                    type: 'string',
                    description: 'The target flight ID to compare against'
                  }
                },
                required: ['baseFlightId', 'targetFlightId']
              }
            },
            {
              name: 'termlens_flight_inspect',
              description: 'Inspects recorded flight logs and telemetry from .termlens/flights.',
              inputSchema: {
                type: 'object',
                properties: {
                  flightId: {
                    type: 'string',
                    description: 'Flight ID to inspect (defaults to "latest")'
                  }
                }
              }
            },
            {
              name: 'termlens_list_lenses',
              description: 'Lists all available built-in and user-defined semantic lenses supported by termlens.',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'termlens_explain',
              description: 'Provides an actionable diagnostic explanation and fix suggestion for an isolated error.',
              inputSchema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'string',
                    description: 'The error message or failure summary'
                  },
                  file: {
                    type: 'string',
                    description: 'The failing file path if known'
                  },
                  snippet: {
                    type: 'string',
                    description: 'The code snippet around the failure'
                  }
                },
                required: ['error']
              }
            }
          ]
        }
      });
      return;
    }

    // MCP tool execution: tools/call
    if (method === 'tools/call') {
      const toolName = (params as { name?: string })?.name;
      const args = (params as { arguments?: Record<string, unknown> })?.arguments || {};

      if (toolName === 'termlens_exec') {
        const command = String(args.command || '');
        const lens = args.lens ? String(args.lens) : undefined;
        const cwd = args.cwd ? String(args.cwd) : undefined;
        const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 60000;
        const quietSuccess = Boolean(args.quietSuccess);
        const maxErrors = typeof args.maxErrors === 'number' ? args.maxErrors : 8;
        const diffWithLast = Boolean(args.diffWithLast);
        const enrichSource = args.enrichSource !== false;

        try {
          const result = await engine.execute(command, {
            lens,
            cwd,
            timeoutMs,
            agentMode: true,
            quietSuccess,
            maxErrors,
            diffWithLast,
            enrichSource
          });

          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: result.agentFormatted
                }
              ],
              isError: result.status !== 'success'
            }
          });
        } catch (err: unknown) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: `Execution error: ${err instanceof Error ? err.message : String(err)}`
            }
          });
        }
        return;
      }

      if (toolName === 'termlens_compact') {
        const text = String(args.text || '');
        const lens = args.lens ? String(args.lens) : undefined;
        const quietSuccess = Boolean(args.quietSuccess);
        const enrichSource = Boolean(args.enrichSource);

        try {
          const result = engine.compactText(text, lens, 'piped_input', {
            agentMode: true,
            quietSuccess,
            enrichSource
          });

          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: result.agentFormatted
                }
              ],
              isError: result.status !== 'success'
            }
          });
        } catch (err: unknown) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: `Compaction error: ${err instanceof Error ? err.message : String(err)}`
            }
          });
        }
        return;
      }

      if (toolName === 'termlens_suggest_fix') {
        const error = String(args.error || '');
        const command = args.command ? String(args.command) : '';
        const file = args.file ? String(args.file) : undefined;
        const line = typeof args.line === 'number' ? args.line : undefined;
        const snippet = args.snippet ? String(args.snippet) : undefined;

        const remediations = engine.getRemediationEngine().analyze(
          [{ message: error, file, line, snippet }],
          command
        );

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(remediations, null, 2)
              }
            ]
          }
        });
        return;
      }

      if (toolName === 'termlens_diff') {
        const baseId = String(args.baseFlightId || '');
        const targetId = String(args.targetFlightId || '');
        const recorder = engine.getFlightRecorder();

        const baseFlight = baseId === 'latest' ? recorder.getLatest() : recorder.get(baseId);
        const targetFlight = targetId === 'latest' ? recorder.getLatest() : recorder.get(targetId);

        if (!baseFlight || !targetFlight) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `Could not find flight records: ${baseId}, ${targetId}`
            }
          });
          return;
        }

        const diff = diffFlights(baseFlight, targetFlight);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: diff.markdown
              }
            ]
          }
        });
        return;
      }

      if (toolName === 'termlens_flight_inspect') {
        const flightId = args.flightId ? String(args.flightId) : 'latest';
        const recorder = engine.getFlightRecorder();
        const record = flightId === 'latest' ? recorder.getLatest() : recorder.get(flightId);

        if (!record) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: `No flight found for id: ${flightId}`
            }
          });
          return;
        }

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(record, null, 2)
              }
            ]
          }
        });
        return;
      }

      if (toolName === 'termlens_list_lenses') {
        const lenses = activeRegistry.listLenses();
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(lenses, null, 2)
              }
            ]
          }
        });
        return;
      }

      if (toolName === 'termlens_explain') {
        const error = String(args.error || '');
        const file = args.file ? String(args.file) : '';
        const snippet = args.snippet ? String(args.snippet) : '';

        const explanationParts = [
          `### 🛠️ Diagnostic Analysis`,
          `**Root Failure:** ${error}`
        ];
        if (file) explanationParts.push(`**Target Location:** \`${file}\``);
        if (snippet) {
          explanationParts.push(`**Context:**\n\`\`\`\n${snippet}\n\`\`\``);
        }

        const remediations = engine.getRemediationEngine().analyze(
          [{ message: error, file: file || undefined, snippet: snippet || undefined }],
          ''
        );

        if (remediations.length > 0) {
          explanationParts.push(`**Remediation Recommendation:** ${remediations[0].explanation}`);
          if (remediations[0].suggestedCommand) {
            explanationParts.push(`**Suggested Command:** \`${remediations[0].suggestedCommand}\``);
          }
          if (remediations[0].patchHypothesis) {
            explanationParts.push(`**Patch Hypothesis:** ${remediations[0].patchHypothesis}`);
          }
        } else {
          explanationParts.push(`**Recommended Action:** Inspect the cited file and assertion expectations. Ensure types, mocks, and return signatures match.`);
        }

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: explanationParts.join('\n')
              }
            ]
          }
        });
        return;
      }

      sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Tool not found: ${toolName}` }
      });
      return;
    }

    // Unknown method
    sendResponse({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not supported: ${method}` }
    });
  });
}
