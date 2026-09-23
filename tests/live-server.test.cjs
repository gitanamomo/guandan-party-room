/* GINA 牌友会 · 本地服务器真实 HTTP 集成测试
   真的启动 server.cjs，用 fetch 走完整流程：建房 → 三人加入 → 四席准备 → 发牌。
   运行：node tests/live-server.test.cjs（会自动选一个空闲端口，不影响已在跑的 8769） */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = Number(process.env.TEST_PORT) || 8899;
const BASE = `http://127.0.0.1:${PORT}`;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const api = async (route, { method = 'GET', body, token } = {}) => {
  const res = await fetch(BASE + '/api/' + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, ...(await res.json()) };
};
const post = (route, body, token) => api(route, { method: 'POST', body, token });

let child;
async function startServer() {
  child = spawn(process.execPath, ['server.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });
  // 轮询直到端口可用
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/index.html');
      if (r.ok) return;
    } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('服务器未能在 6 秒内启动。stderr: ' + stderr);
}
function stopServer() { if (child && !child.killed) child.kill('SIGTERM'); }

/* ---- 静态资源必须按真实路径可取（Netlify 上靠这一点保证 room.html 不被兜底吞掉）---- */
test('静态资源：/index.html /room.html /app.js /engine.js /assets 图片均 200', async () => {
  for (const p of ['/index.html', '/room.html', '/app.js', '/engine.js', '/room.js', '/assets/guandan-club-v2.png', '/assets/guandan-teahouse.jpg', '/assets/bgm.mp3']) {
    const res = await fetch(BASE + p);
    assert.equal(res.status, 200, p + ' 应可访问，实际 ' + res.status);
  }
});

test('index.html 内含进入联机房间的入口链接', async () => {
  const html = await (await fetch(BASE + '/index.html')).text();
  assert.ok(html.includes('href="room.html"'), 'index.html 必须能点进 room.html');
});

test('app.js 是合法 JS（能被浏览器解析），不是被错误响应的 HTML', async () => {
  const res = await fetch(BASE + '/app.js');
  const type = res.headers.get('content-type') || '';
  const body = await res.text();
  assert.ok(type.includes('javascript'), 'content-type 应为 javascript，实际 ' + type);
  assert.ok(body.startsWith("'use strict';"), 'app.js 开头应为严格模式声明');
});

test('建房 → 三人加入 → 四席准备 → 每人 27 张且牌不重复', async () => {
  const owner = await post('create', { name: '房主', password: 'gina' });
  assert.equal(owner.ok, true, '建房失败：' + owner.error);
  assert.equal(owner.state.players.filter(p => p === null).length, 3, '房主只应占 1 个座位');

  const code = owner.state.code;
  const tokens = [owner.token];
  for (const i of [1, 2, 3]) {
    const j = await post('join', { name: '玩家' + i, code, password: 'gina' });
    assert.equal(j.ok, true, '加入失败：' + j.error);
    assert.equal(j.state.seat, i, '座位应依次为 ' + i);
    tokens.push(j.token);
  }

  for (const t of tokens) {
    const r = await post('action', { type: 'ready', ready: true }, t);
    assert.equal(r.ok, true, '准备失败：' + r.error);
  }

  const seen = new Set();
  for (const t of tokens) {
    const s = await api('state', { token: t });
    assert.equal(s.ok, true);
    assert.equal(s.state.started, true, '四人准备后应已发牌');
    assert.equal(s.state.game.hand.length, 27, '每人 27 张');
    for (const c of s.state.game.hand) {
      assert.ok(!seen.has(c.id), '同一实体牌不可下发两个会话：' + c.id);
      seen.add(c.id);
    }
  }
  assert.equal(seen.size, 108, '四家合计 108 张');
});

test('房间已满时第五人被拒', async () => {
  const owner = await post('create', { name: '房主', password: 'gina' });
  const code = owner.state.code;
  for (const i of [1, 2, 3]) await post('join', { name: 'p' + i, code, password: 'gina' });
  const full = await post('join', { name: '第五人', code, password: 'gina' });
  assert.equal(full.status, 400);
  assert.match(full.error, /已满/);
});

test('错误口令被拒', async () => {
  const bad = await post('create', { name: 'x', password: 'nope' });
  assert.equal(bad.status, 403);
});

(async () => {
  await startServer();
  let passed = 0;
  try {
    for (const [name, fn] of tests) {
      await fn();
      passed++;
      console.log('✓ ' + name);
    }
    console.log(`\n${passed} tests passed`);
  } finally {
    stopServer();
  }
})().catch(e => {
  stopServer();
  console.error('✗ 测试失败：' + e.message);
  process.exit(1);
});
