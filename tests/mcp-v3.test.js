import test from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

test('MCP Server v3: supports resources/list, resources/read, termlens_suggest_fix, and termlens_diff', (t, done) => {
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
      assert.strictEqual(initRes.result.serverInfo.version, '0.3.0');
      assert.ok(initRes.result.capabilities.resources !== undefined);
      assert.ok(initRes.result.capabilities.prompts !== undefined);

      // 2. Resources list
      const resList = await request(2, 'resources/list');
      assert.ok(Array.isArray(resList.result.resources));
      const uris = resList.result.resources.map(r => r.uri);
      assert.ok(uris.includes('termlens://flights/latest'));
      assert.ok(uris.includes('termlens://lenses'));

      // 3. Resources read lenses
      const readLenses = await request(3, 'resources/read', { uri: 'termlens://lenses' });
      assert.ok(readLenses.result.contents[0].text.includes('node-test'));
      assert.ok(readLenses.result.contents[0].text.includes('bundler'));

      // 3b. Resources read path traversal protection
      const readTraversal = await request(31, 'resources/read', { uri: 'termlens://flights/../../package.json' });
      assert.ok(readTraversal.result.contents[0].text.includes('Flight not found'));

      // 3c. Prompts list and get
      const promptsList = await request(32, 'prompts/list');
      const promptNames = promptsList.result.prompts.map(p => p.name);
      assert.ok(promptNames.includes('fix_terminal_error'));
      assert.ok(promptNames.includes('diff_runs'));

      const promptGet = await request(33, 'prompts/get', {
        name: 'fix_terminal_error',
        arguments: { command: 'npm test', error: 'AssertionError: fail' }
      });
      assert.ok(promptGet.result.messages !== undefined);
      assert.ok(promptGet.result.messages[0].content.text.includes('AssertionError: fail'));

      // 4. Tool call: termlens_suggest_fix
      const fixRes = await request(4, 'tools/call', {
        name: 'termlens_suggest_fix',
        arguments: {
          error: "Cannot find module 'chalk'",
          command: 'npm start'
        }
      });
      assert.strictEqual(fixRes.result.isError, undefined);
      assert.ok(fixRes.result.content[0].text.includes('npm install chalk'));

      // 5. Tool call: termlens_flight_inspect
      const flightInspectRes = await request(5, 'tools/call', {
        name: 'termlens_flight_inspect',
        arguments: { flightId: 'non_existent_flight' }
      });
      assert.ok(flightInspectRes.error !== undefined);

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
