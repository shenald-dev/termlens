import * as readline from 'node:readline';
import { TermlensEngine } from '../engine.js';

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
export async function runMcpServer(engine: TermlensEngine): Promise<void> {
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
            version: '0.1.0'
          },
          capabilities: {
            tools: {}
          }
        }
      });
      return;
    }

    // MCP lifecycle: ping
    if (method === 'ping') {
      sendResponse({ jsonrpc: '2.0', id, result: {} });
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
              description: 'Executes a bash/shell command with automatic token-compaction, stripping 90%+ terminal noise while isolating actionable failures for LLMs.',
              inputSchema: {
                type: 'object',
                properties: {
                  command: {
                    type: 'string',
                    description: 'The shell command to execute (e.g., npm test, pytest, tsc, docker build)'
                  },
                  lens: {
                    type: 'string',
                    description: 'Optional explicit lens to apply: jest, pytest, tsc, cargo, docker, generic (default: auto)'
                  },
                  cwd: {
                    type: 'string',
                    description: 'Optional working directory'
                  },
                  timeoutMs: {
                    type: 'number',
                    description: 'Optional execution timeout in milliseconds (default: 60000)'
                  }
                },
                required: ['command']
              }
            },
            {
              name: 'termlens_compact',
              description: 'Compacts an existing noisy terminal text or log block, stripping ANSI noise and extracting errors into an ultra-dense format.',
              inputSchema: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: 'The raw terminal output or log text to compact'
                  },
                  lens: {
                    type: 'string',
                    description: 'Optional lens to apply: jest, pytest, tsc, cargo, docker, generic'
                  }
                },
                required: ['text']
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

        try {
          const result = await engine.execute(command, {
            lens,
            cwd,
            timeoutMs,
            agentMode: true
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

        try {
          const result = engine.compactText(text, lens);
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
