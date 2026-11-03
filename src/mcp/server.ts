import * as readline from 'node:readline';
import { TermlensEngine } from '../engine.js';
import { LensRegistry } from '../lenses/index.js';

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
  const activeRegistry = registry || new LensRegistry();
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
            version: '0.2.0'
          },
          capabilities: {
            tools: {},
            prompts: {}
          }
        }
      });
      return;
    }

    // MCP notification: notifications/initialized (no response required by json-rpc notifications)
    if (method === 'notifications/initialized' || method === 'initialized') {
      return;
    }

    // MCP lifecycle: ping
    if (method === 'ping') {
      sendResponse({ jsonrpc: '2.0', id, result: {} });
      return;
    }

    // MCP prompts discovery
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
            }
          ]
        }
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
                    description: 'Optional explicit lens to apply: jest, pytest, tsc, go, python-lint, js-lint, clang, dotnet, cargo, docker, generic (default: auto)'
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
                    description: 'Optional lens to apply: jest, pytest, tsc, go, python-lint, js-lint, clang, dotnet, cargo, docker, generic'
                  },
                  quietSuccess: {
                    type: 'boolean',
                    description: 'If true, produces minimal output on passing runs'
                  }
                },
                required: ['text']
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

        try {
          const result = await engine.execute(command, {
            lens,
            cwd,
            timeoutMs,
            agentMode: true,
            quietSuccess,
            maxErrors
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

        try {
          const result = engine.compactText(text, lens, 'piped_input', {
            agentMode: true,
            quietSuccess
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
        explanationParts.push(`**Recommended Action:** Inspect the cited file and assertion expectations. Ensure types, mocks, and return signatures match.`);

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
