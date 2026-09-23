/* GINA 牌友会 · Netlify Function 离线回归测试
   用内存 store 替换 Netlify Blobs，验证线上房间真的能四人开局、能打第二副。
   其中「并发准备」一例用带传播延迟的 store 模拟 Netlify Blobs 的最终一致性，
   用于防止「共享记录读-改-写互相覆盖」这个已修复的架构缺陷复发。
   运行：node tests/netlify-api.test.cjs */
const assert = require('node:assert/strict');
const api = require('../netlify/functions/api.js');
const GD = require('../engine.js');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- 内存版 Blobs store（瞬时一致，用于常规流程） ---- */
function memStore() {
  const map = new Map();
  return {
    async get(key, opts) {
      if (!map.has(key)) return null;
      const v = map.get(key);
      return opts && opts.type === 'json' ? JSON.parse(v) : v;
    },
    async set(key, value) { map.set(key, value); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(k => k.startsWith(prefix)).map(k => ({ key: k })) };
    },
    async delete(key) { map.delete(key); },
    _raw: map
  };
}

/* ---- 模拟最终一致性：读到的值比真实值滞后 delayMs ----
   这正是线上 Netlify Blobs 的行为（实测写入后数秒才可读）。 */
function staleStore(delayMs = 150) {
  const map = new Map();                       // key -> 当前值
  const hist = new Map();                      // key -> [{v,t}]
  const rec = (key, v) => {
    if (!hist.has(key)) hist.set(key, []);
    hist.get(key).push({ v, t: Date.now() });
  };
  return {
    async get(key, opts) {
      const list = hist.get(key) || [];
      const cutoff = Date.now() - delayMs;
      let pick = null;
      for (const e of list) if (e.t <= cutoff) pick = e;   // 只认已经“传播开”的写入
      if (pick == null) return null;
      return opts && opts.type === 'json' ? JSON.parse(pick.v) : pick.v;
    },
    async set(key, value) { map.set(key, value); rec(key, value); },
    async delete(key) { map.delete(key); hist.set(key, []); },
    async list({ prefix = '' } = {}) {
      const cutoff = Date.now() - delayMs;
      const keys = [...hist.keys()].filter(k => k.startsWith(prefix))
        .filter(k => (hist.get(k) || []).some(e => e.t <= cutoff));   // 列表同样有滞后
      return { blobs: keys.map(k => ({ key: k })) };
    },
    _raw: map
  };
}

let store;
const call = async (path, { method = 'GET', body, token } = {}) => {
  const res = await api.handler({
    path,
    httpMethod: method,
    headers: token ? { authorization: 'Bearer ' + token } : {},
    body: body === undefined ? null : JSON.stringify(body)
  });
  return { status: res.statusCode, ...JSON.parse(res.body) };
};
const post = (route, body, token) => call('/api/' + route, { method: 'POST', body, token });
const getState = token => call('/api/state', { method: 'GET', token });

const reset = (kind = 'mem', delay) => {
  store = kind === 'stale' ? staleStore(delay) : memStore();
  api.__setStore(store);
  if (api.__clearSessions) api.__clearSessions();   // 清会话缓存，用例之间互不影响
};
/* 建一个满员并已发牌的房间：建房 → 三人加入 → 四席准备 → 房主轮询触发开局 */
async function startedRoom(opts = {}) {
  reset(opts.kind || 'mem', opts.delay);
  const owner = await post('create', { name: '房主', password: 'gina' });
  const code = owner.state.code;
  const tokens = [owner.token];
  for (const i of [1, 2, 3]) {
    const j = await post('join', { name: '玩家' + i, code, password: 'gina' });
    assert.equal(j.ok, true, '加入失败：' + j.error);
    tokens.push(j.token);
  }
  for (const t of tokens) {
    const r = await post('action', { type: 'ready', ready: true }, t);
    assert.equal(r.ok, true, '准备失败：' + r.error);
  }
  // 开局由房主触发（房主客户端每 900ms 轮询一次）
  const s = await getState(tokens[0]);
  assert.equal(s.ok, true);
  assert.equal(s.state.started, true, '四席准备后房主轮询应触发发牌');
  return { code, tokens };
}

test('创建房间：房主只占 0 号一个座位，其余三席为空', async () => {
  reset();
  const r = await post('create', { name: '房主', password: 'gina' });
  assert.equal(r.ok, true);
  assert.equal(r.state.seat, 0);
  assert.equal(r.state.players.filter(p => p === null).length, 3, '必须留 3 个空座');
  assert.equal(r.state.players[0].name, '房主');
  assert.match(r.state.code, /^\d{6}$/, '房间号为 6 位');
});

test('四名玩家可依次入座，第五人提示房间已满', async () => {
  reset();
  const owner = await post('create', { name: '房主', password: 'gina' });
  const code = owner.state.code;
  const seats = [owner.state.seat];
  for (const i of [1, 2, 3]) {
    await sleep(5);            // 真人加入不会挤在同一毫秒，间隔一下才符合真实时序
    const j = await post('join', { name: '玩家' + i, code, password: 'gina' });
    assert.equal(j.ok, true, '第 ' + i + ' 位应能加入：' + j.error);
    seats.push(j.state.seat);
  }
  assert.equal(owner.state.seat, 0, '房主应固定为 0 号');
  assert.deepEqual([...seats].sort((a, b) => a - b), [0, 1, 2, 3], '四人应各占一个不同座位，实际 ' + seats.join(','));
  const full = await post('join', { name: '第五人', code, password: 'gina' });
  assert.equal(full.status, 400);
  assert.match(full.error, /已满/);
});

test('错误口令被拒；无 token 访问被拒；房间号格式校验', async () => {
  reset();
  assert.equal((await post('create', { name: 'x', password: 'wrong' })).status, 403);
  assert.equal((await getState('')).status, 401);
  const bad = await post('join', { name: 'x', code: 'abc', password: 'gina' });
  assert.equal(bad.status, 400);
  assert.match(bad.error, /6 位数字/);
});

test('四席准备后发牌：每人 27 张，且只能看到自己的手牌', async () => {
  const { tokens } = await startedRoom();
  const states = [];
  for (const t of tokens) {
    const s = await getState(t);
    assert.equal(s.state.started, true);
    assert.equal(s.state.game.hand.length, 27, '每人 27 张');
    states.push(s.state);
  }
  const seen = new Set();
  for (const st of states) {
    for (const c of st.game.hand) {
      assert.ok(!seen.has(c.id), '同一张实体牌不可下发给两个会话：' + c.id);
      seen.add(c.id);
    }
  }
  assert.equal(seen.size, 108, '四家手牌合计应为 108 张');
  assert.equal(states[0].players[1].cards, 27, '别家只暴露张数');
  assert.equal(states[0].players[1].hand, undefined, '不得下发他人手牌');
});

/* 架构回归：旧实现把 4 人的 ready 写进同一条记录做「读-改-写」，
   在最终一致性下会互相覆盖，导致牌局永远开不了。
   本用例用带传播延迟的 store 模拟该环境，四个人同时点准备，必须仍然正常开局。 */
test('并发准备不丢更新（模拟最终一致性的存储）', async () => {
  reset('stale', 120);
  const owner = await post('create', { name: '房主', password: 'gina' });
  const code = owner.state.code;
  const tokens = [owner.token];
  for (const i of [1, 2, 3]) {
    const j = await post('join', { name: '玩家' + i, code, password: 'gina' });
    assert.equal(j.ok, true, '加入失败：' + j.error);
    tokens.push(j.token);
  }
  // 四人几乎同时点“准备”
  await Promise.all(tokens.map(t => post('action', { type: 'ready', ready: true }, t)));
  await sleep(200);                        // 等写入传播
  const s = await getState(tokens[0]);     // 房主轮询触发开局
  assert.equal(s.ok, true, '房主读取失败：' + s.error);
  assert.equal(s.state.players.filter(Boolean).length, 4, '四席都必须在（旧实现会覆盖丢人）');
  assert.equal(s.state.players.filter(p => p && p.ready).length, 4, '四人的准备状态都必须在');
  assert.equal(s.state.started, true, '四席准备后必须开局');
  assert.equal(s.state.game.hand.length, 27);
});

/* 架构回归：旧实现让加入者「读一遍房间、找空座、写回整条记录」，
   在最终一致性下三个人会同时选中同一个空座，后者覆盖前者，
   被覆盖者的令牌从此解析不出座位 → 一直报“会话无效”。
   新实现每人只写自己那把钥匙，并发加入也不会互相影响。 */
test('并发加入不丢人：令牌都能解析，传播后四席互不重复（模拟最终一致性的存储）', async () => {
  reset('stale', 120);
  const owner = await post('create', { name: '房主', password: 'gina' });
  const code = owner.state.code;
  const joins = await Promise.all([1, 2, 3].map(i =>
    post('join', { name: '玩家' + i, code, password: 'gina' })));
  assert.equal(joins.filter(j => j.ok).length, 3,
    '三人应都能加入：' + joins.map(j => j.error || 'ok').join(' / '));

  // 最终一致性下，加入那一刻报出的座位号只能算临时值（列表尚在传播中）；
  // 真正的不变量是：传播完成后每个令牌都能解析出座位，且四席互不重复。
  await sleep(1500);
  const seats = [owner.state.seat];
  for (const j of joins) {
    // 与真实客户端一致：座位被抢占时服务端会自愈，过程中可能短暂 401，需要重试
    let s = null;
    for (let i = 0; i < 8; i++) {
      s = await getState(j.token);              // 不传房间号，走令牌→房间回退路径
      if (s.ok) break;
      await sleep(500);
    }
    assert.equal(s.ok, true, '令牌应能解析出座位：' + s.error);
    seats.push(s.state.seat);
  }
  assert.deepEqual([...seats].sort((a, b) => a - b), [0, 1, 2, 3],
    '传播后四席必须互不重复，实际 ' + seats.join(','));

  // 而且必须能正常开局：四人准备 → 房主触发发牌
  for (const j of joins) {
    const r = await post('action', { type: 'ready', ready: true, code }, j.token);
    assert.equal(r.ok, true, '准备失败：' + r.error);
  }
  const ownerReady = await post('action', { type: 'ready', ready: true, code }, owner.token);
  assert.equal(ownerReady.ok, true, '房主准备失败：' + ownerReady.error);

  // 真实客户端每 900ms 轮询一次，开局正是在某次轮询中被触发的；
  // 单次读取可能仍看到尚未传播完的准备状态，所以这里同样轮询。
  let st = null;
  for (let i = 0; i < 12; i++) {
    st = await getState(owner.token);
    assert.equal(st.ok, true, '读取状态失败：' + st.error);
    if (st.state.started) break;
    await sleep(400);
  }
  assert.equal(st.state.started, true, '四席准备后应能开局');
  assert.equal(st.state.players.filter(Boolean).length, 4, '四席都必须在');
  assert.equal(st.state.players.filter(p => p && p.ready).length, 4, '四人准备状态都必须在');
  assert.equal(st.state.game.hand.length, 27, '房主应看到自己的 27 张手牌');
});

test('打完一副后开下一副：random 被正确还原（抗贡/还贡两种分支都覆盖）', async () => {
  const { code, tokens } = await startedRoom();
  const raw = JSON.parse(store._raw.get('room:' + code));
  assert.equal(typeof raw.game.random, 'undefined', '前提：JSON 里确实没有 random 函数');
  raw.game.phase = 'over';
  raw.game.finished = [0, 1, 2, 3];
  raw.game.previous = [0, 1, 2, 3];
  raw.game.result = { team: 0, up: 3, order: [0, 2, 1, 3], double: true };
  store._raw.set('room:' + code, JSON.stringify(raw));

  const next = await post('action', { type: 'next' }, tokens[0]);
  assert.equal(next.ok, true, '开下一副应成功，实际：' + next.error);
  assert.equal(next.state.game.round, 2, '副数应推进到第 2 副');

  // 第二副起按上副结果贡还。抗贡用的是「新发的手牌」，因此约 6% 概率
  // 末游正好抓到两张大王而免贡——两种分支都是合法结果，都要能走通。
  const total = next.state.players.reduce((n, p) => n + (p ? p.cards : 0), 0);
  assert.equal(total, 108, '新一副四家合计仍应为 108 张');
  if (next.state.game.phase === 'return') {
    assert.equal(next.state.game.returns.length, 1, '单贡应产生一条还贡义务');
    const receiver = next.state.game.returns[0].from;
    const payerState = (await getState(tokens[receiver])).state;
    const payerHand = payerState.game.hand;
    const lv = payerState.game.level;
    const allowed = payerHand.filter(c => c.r < 16 && c.r !== lv && c.r <= 10);
    const choice = allowed[0] || payerHand[payerHand.length - 1];
    const back = await post('action', { type: 'play', ids: [choice.id] }, tokens[receiver]);
    assert.equal(back.ok, true, '还贡应成功：' + back.error);
    assert.equal(back.state.game.phase, 'play', '还贡完成后进入出牌阶段');
    for (const t of tokens) {
      assert.equal((await getState(t)).state.game.hand.length, 27, '还贡后每人 27 张');
    }
  } else {
    assert.equal(next.state.game.phase, 'play', '抗贡时应直接开打');
    assert.equal(next.state.game.returns.length, 0, '抗贡不应有还贡义务');
    for (const t of tokens) {
      assert.equal((await getState(t)).state.game.hand.length, 27, '抗贡后每人 27 张');
    }
  }
});

test('贡还阶段的服务端 giveBack 通道可用（确定性用例）', async () => {
  const { code, tokens } = await startedRoom();
  // 直接构造“等待还贡”的记录：0 号收贡，需要还给 3 号
  const raw = JSON.parse(store._raw.get('room:' + code));
  raw.game.phase = 'return';
  raw.game.returns = [{ from: 0, to: 3 }];
  store._raw.set('room:' + code, JSON.stringify(raw));

  const st = await getState(tokens[0]);
  assert.equal(st.ok, true, '读取失败：' + st.error);
  assert.equal(st.state.game.phase, 'return');
  const hand = st.state.game.hand;
  const lv = st.state.game.level;
  const allowed = hand.filter(c => c.r < 16 && c.r !== lv && c.r <= 10);
  const choice = allowed[0] || hand[hand.length - 1];
  const r = await post('action', { type: 'play', ids: [choice.id] }, tokens[0]);
  assert.equal(r.ok, true, '还贡应成功：' + r.error);
  assert.equal(r.state.game.phase, 'play', '还贡完成后进入出牌阶段');
  assert.equal(r.state.game.returns.length, 0, '还贡义务应清空');
});

/* 架构回归：滞后视图会让后来者以为自己占的是空席，从而把先到者覆盖掉。
   被覆盖者必须能补回座位，而且不能让「一人占两席」把房间永久堵死。 */
test('被并发覆盖的玩家能补回座位，且不会一人占两席', async () => {
  reset();
  const owner = await post('create', { name: '房主', password: 'gina' });
  const code = owner.state.code;
  const p1 = await post('join', { name: 'p1', code, password: 'gina' });
  const p2 = await post('join', { name: 'p2', code, password: 'gina' });
  const stolen = p2.state.seat;

  // 模拟并发覆盖：把 p2 的席位改写成 p1 → p1 占两席、p2 无席
  const slotRaw = JSON.parse(store._raw.get('seat:' + code + ':' + stolen));
  store._raw.set('seat:' + code + ':' + stolen, JSON.stringify({ ...slotRaw, token: p1.token, name: 'p1' }));

  const s = await getState(p2.token);
  assert.equal(s.ok, true, '被覆盖的玩家应能补回座位：' + s.error);
  assert.ok(s.state.seat >= 0 && s.state.seat <= 3, '补回的应为有效席位，实际 ' + s.state.seat);

  // 真正的不变量：三人各占一席、不再有重复占位（回收的是哪一个重复席位都可以）
  const tokens = [0, 1, 2, 3].map(n => {
    const v = store._raw.get('seat:' + code + ':' + n);
    return v ? JSON.parse(v).token : null;
  }).filter(Boolean);
  assert.equal(tokens.length, 3, '应恰好三人入座，实际 ' + tokens.length);
  assert.equal(new Set(tokens).size, tokens.length, '不应存在重复占位');
  assert.ok(tokens.includes(p2.token), 'p2 必须重新拿到座位');
});

test('非房主开下一副被拒', async () => {
  const { code, tokens } = await startedRoom();
  const raw = JSON.parse(store._raw.get('room:' + code));
  raw.game.phase = 'over';
  raw.game.finished = [0, 1, 2, 3];
  store._raw.set('room:' + code, JSON.stringify(raw));

  const r = await post('action', { type: 'next' }, tokens[1]);
  assert.equal(r.status, 400);
  assert.match(r.error, /房主/);
});

test('重连回到原座位，不重复占座', async () => {
  reset();
  const owner = await post('create', { name: '房主', password: 'gina' });
  const code = owner.state.code;
  const p1 = await post('join', { name: '玩家1', code, password: 'gina' });
  const seat1 = p1.state.seat;
  assert.ok(seat1 >= 1 && seat1 <= 3, '加入者应落在 1~3 号席，实际 ' + seat1);

  const again = await post('reconnect', { code, token: p1.token });
  assert.equal(again.ok, true, '重连失败：' + again.error);
  assert.equal(again.state.seat, seat1, '重连应回到原座位');
  assert.equal(again.state.players.filter(Boolean).length, 2, '重连不应新增玩家');

  const viaJoin = await post('join', { name: '玩家1', code, password: 'gina', token: p1.token });
  assert.equal(viaJoin.state.seat, seat1, '带旧 token 再次加入也必须回原座');
});

test('开局后新玩家无法挤入', async () => {
  const { code } = await startedRoom();
  const late = await post('join', { name: '迟到者', code, password: 'gina' });
  assert.equal(late.status, 400);
  assert.match(late.error, /已开始/);
});

test('不是自己回合时出牌被服务端拒绝', async () => {
  const { tokens } = await startedRoom();
  const st = (await getState(tokens[0])).state;
  const notTurn = [0, 1, 2, 3].find(i => i !== st.game.turn);
  const hand = (await getState(tokens[notTurn])).state.game.hand;
  const r = await post('action', { type: 'play', ids: [hand[0].id] }, tokens[notTurn]);
  assert.equal(r.status, 400, '不该轮到的玩家出牌必须被拒');
});

test('非法牌型不扣牌', async () => {
  const { tokens } = await startedRoom();
  const st = (await getState(tokens[0])).state;
  const turn = st.game.turn;
  const before = (await getState(tokens[turn])).state.game.hand;
  // 必须是确定性的非法组合：随手抓两张可能恰好成对（甚至红桃级牌配出的对子），
  // 那样就成了合法出牌，断言会偶发失败。这里刻意挑两张「非百搭且点数不同」的牌。
  const level = st.game.level;
  const usable = before.filter(c => !(c.r === level && c.s === '♥'));
  let ids = null;
  for (const a of usable) {
    const b = usable.find(x => x.id !== a.id && x.r !== a.r);
    if (b) { ids = [a.id, b.id]; break; }
  }
  assert.ok(ids, '手牌里应能找出两张点数不同的非百搭牌');
  assert.equal(GD.classify(before.filter(c => ids.includes(c.id)), level).length, 0,
    '前提：该两张牌不构成任何合法牌型');

  const r = await post('action', { type: 'play', ids }, tokens[turn]);
  assert.equal(r.status, 400, '非法牌型应被拒绝');
  const after = (await getState(tokens[turn])).state.game.hand;
  assert.equal(after.length, before.length, '非法出牌不得改变手牌张数');
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log('✓ ' + name);
  }
  console.log(`\n${passed} tests passed`);
})().catch(e => {
  console.error('✗ 测试失败：' + e.message);
  console.error(e.stack);
  process.exit(1);
});
