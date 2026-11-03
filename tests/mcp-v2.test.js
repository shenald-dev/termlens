import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

test('MCP Server v2: supports termlens_list_lenses, termlens_explain, and prompts/list', (t, done) => {
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

      // 2. Notification initialized (no response expected)
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

      // 3. Ping
      const pingRes = await request(2, 'ping');
      assert.ok(pingRes.result !== undefined);

      // 4. Prompts list
      const promptsRes = await request(3, 'prompts/list');
      assert.ok(promptsRes.result.prompts.length > 0);
      assert.strictEqual(promptsRes.result.prompts[0].name, 'fix_terminal_error');

      // 5. Tool call: termlens_list_lenses
      const listLensesRes = await request(4, 'tools/call', {
        name: 'termlens_list_lenses',
        arguments: {}
      });
      assert.strictEqual(listLensesRes.result.isError, undefined);
      const lensesJson = JSON.parse(listLensesRes.result.content[0].text);
      const lensNames = lensesJson.map(l => l.name);
      assert.ok(lensNames.includes('go'));
      assert.ok(lensNames.includes('python-lint'));
      assert.ok(lensNames.includes('js-lint'));
      assert.ok(lensNames.includes('clang'));
      assert.ok(lensNames.includes('dotnet'));

      // 6. Tool call: termlens_explain
      const explainRes = await request(5, 'tools/call', {
        name: 'termlens_explain',
        arguments: {
          error: 'Expected 401 but received 200',
          file: 'src/auth/jwt.test.ts',
          snippet: 'expect(status).toBe(401)'
        }
      });
      assert.ok(explainRes.result.content[0].text.includes('Diagnostic Analysis'));
      assert.ok(explainRes.result.content[0].text.includes('src/auth/jwt.test.ts'));

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
