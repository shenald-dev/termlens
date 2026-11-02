import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

test('MCP Server: responds to initialize, tools/list, and termlens_compact over stdio', (t, done) => {
  const child = spawn('node', ['./bin/termlens.js', '--mcp'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'inherit']
  });

  const rl = readline.createInterface({
    input: child.stdout,
    terminal: false
  });

  const pending = new Map();

  rl.on('line', (line) => {
    try {
      const parsed = JSON.parse(line.trim());
      if (parsed.id && pending.has(parsed.id)) {
        const resolve = pending.get(parsed.id);
        pending.delete(parsed.id);
        resolve(parsed);
      }
    } catch {}
  });

  const request = (id, method, params = {}) => {
    return new Promise((resolve) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  };

  (async () => {
    try {
      // 1. Initialize
      const initRes = await request(1, 'initialize');
      assert.strictEqual(initRes.result.serverInfo.name, 'termlens');

      // 2. Tools list
      const toolsRes = await request(2, 'tools/list');
      const toolNames = toolsRes.result.tools.map(t => t.name);
      assert.ok(toolNames.includes('termlens_exec'));
      assert.ok(toolNames.includes('termlens_compact'));

      // 3. Tool call: termlens_compact
      const callRes = await request(3, 'tools/call', {
        name: 'termlens_compact',
        arguments: {
          text: 'FAIL test.ts\n  ● should work\n    Expected: 1\n    Received: 2\nTests: 1 failed',
          lens: 'jest'
        }
      });
      assert.strictEqual(callRes.result.isError, true);
      assert.ok(callRes.result.content[0].text.includes('Command Failed'));

      rl.close();
      child.stdin.end();
      child.kill();
      done();
    } catch (err) {
      rl.close();
      child.kill();
      done(err);
    }
  })();
});
