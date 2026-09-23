'use strict';
/* GINA 牌友会 · Netlify Function（线上权威房间）
   路由：/api/create /api/join /api/reconnect /api/state /api/action

   ── 存储设计（针对 Netlify Blobs 的真实限制）──
   线上实测该存储有三个必须绕开的特性：
     1. 最终一致性：写入后 3~11 秒才可读；
     2. 该运行时上下文不含 uncachedEdgeURL，因此「强一致性读取」不可用；
     3. list() 列表滞后可达数十秒（实测某房间 4 条认领只列出 1 条）。
   因此本实现：
     · 永不调用 list()；座位是固定的四个已知键，直读即可。
     · 每个键只有一个写者，杜绝「读-改-写互相覆盖」：
         seat:<房间号>:<0..3>   一位玩家一席，只由本人写入
         token:<令牌>           → { code, seat }，只由本人写入
         room:<房间号>          → 只放牌局；出牌轮流进行，同一时刻只有一个写者
     · 选座用「令牌哈希选起点 + 直读判空 + 写入后回读校验」，抢到同一席时
       后写的会覆盖先写的，先写者下次请求会发现自己不在座（自愈）并重新占席。
     · 开局：任意玩家读到「四席齐且全部准备」即可把名单冻结进 room（整条写入是原子的），
       之后座位/手牌/轮次全部以该名单为准，不再变动。

   安全约定：每个会话只下发自己的手牌，服务端校验座位、轮次、持牌与牌型。 */
const crypto = require('node:crypto');
const GD = require('../../engine.js');

let store;
const id = (n = 18) => crypto.randomBytes(n).toString('base64url');
const STORE_NAME = 'gina-guandan-rooms';
const MAX_SEATS = 4;
const TTL = 60 * 60 * 12;

const response = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body)
});
const error = (message, status = 400) => response(status, { ok: false, error: message });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stamp = () => Date.now() + Math.random();

function runtimeContext() {
  try {
    const raw = globalThis.netlifyBlobsContext || process.env.NETLIFY_BLOBS_CONTEXT;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    return JSON.parse(Buffer.from(String(raw), 'base64').toString());
  } catch { return {}; }
}

async function ensureStore(event) {
  if (store) return store;
  const blobs = require('@netlify/blobs');
  const ctx = runtimeContext();
  // 只有运行时完全没提供上下文时才走 connectLambda；否则它会覆盖掉更完整的上下文
  if (!ctx.edgeURL && !ctx.uncachedEdgeURL && event.blobs) {
    try { blobs.connectLambda(event); } catch { /* 忽略 */ }
  }
  store = blobs.getStore(STORE_NAME);
  return store;
}

// 仅用于离线回归测试：注入内存 store
exports.__setStore = s => { store = s; };

/* 会话解析缓存：同一实例（热启动）上的连续轮询不必每次都去读
   「令牌→房间」映射——那次读取在最终一致性下要等数秒。
   座位归属仍每次用四个座位键核对，保证正确性。 */
const sessionCache = new Map();
const SESSION_TTL = 60 * 1000;
exports.__clearSessions = () => sessionCache.clear();

async function getJson(key) {
  try {
    return await store.get(key, { type: 'json' });
  } catch (e) {
    throw e;
  }
}
async function getJsonRetry(key, { attempts = 5, gapMs = 400 } = {}) {
  for (let i = 0; ; i++) {
    const v = await getJson(key);
    if (v != null) return v;
    if (i >= attempts - 1) return null;
    await sleep(gapMs);
  }
}

const seatKey = (code, n) => `seat:${code}:${n}`;
const roomKey = code => `room:${code}`;

/* 直接读四个已知座位键——不依赖 list() */
async function readSlots(code, opts) {
  return Promise.all(Array.from({ length: MAX_SEATS }, (_, n) => getJsonRetry(seatKey(code, n), opts)));
}
async function readRoom(code, opts) {
  const r = await getJsonRetry(roomKey(code), opts);
  // engine 的 deal() 依赖 g.random() 洗牌，JSON 会丢掉函数；
  // 不重新挂回则第二副（“下一副”）必定抛 “g.random is not a function”
  if (r && r.game) r.game.random = Math.random;
  return r;
}
async function saveRoom(r) {
  r.updated = Date.now();
  await store.set(roomKey(r.code), JSON.stringify(r));
}
async function writeSeat(code, n, data) {
  await store.set(seatKey(code, n), JSON.stringify(data), { ttl: TTL });
  await store.set('token:' + data.token, JSON.stringify({ code, seat: n }), { ttl: TTL });
}

/* 选座：座位 0 留给房主；其余按令牌哈希决定起点，避免所有人都抢同一席。
   写入后回读校验：确认这一席最终是自己的（抢输就换下一席）。
   只在「加入房间」时调用一次——重复调用（例如在会话解析失败时补救）会造成
   「一人占两席」，反而把别人挤掉。 */
async function claimSeat(code, token, name, slotsInit) {
  let slots = slotsInit || await readSlots(code, { attempts: 3, gapMs: 400 });
  const already = slots.findIndex(s => s && s.token === token);
  if (already >= 0) return { seat: already, slots };

  const hash = crypto.createHash('sha1').update(token).digest()[0] % 3;
  // 两轮扫描：并发抢座时可能第一轮每个候选都读到滞后视图，第二轮用新读到的视图再试
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 3; i++) {
      const n = 1 + ((hash + i + round) % 3);
      if (slots[n]) continue;                     // 已知被占，跳过
      await writeSeat(code, n, { token, name, ready: false, ts: stamp() });
      let winner = null;
      for (let k = 0; k < 9; k++) {               // 等写入可见并确认归属
        const back = await getJson(seatKey(code, n));
        if (back && back.token) { winner = back; break; }
        await sleep(350);
      }
      // 写入本身不会失败；回读若只读到 null，说明只是还没传播开，
      // 此时必须认下这一席，否则会转去写下一席，造成「一人占两席」把别人挤掉。
      if (winner === null || winner.token === token) return { seat: n, slots };
      slots[n] = winner;                          // 确实被别人抢了，换下一席
    }
    // 第二轮前重新读一次视图：可能第一轮的候选都被滞后视图挡住了
    slots = await readSlots(code, { attempts: 3, gapMs: 400 });
    const mine = slots.findIndex(s => s && s.token === token);
    if (mine >= 0) return { seat: mine, slots };
    if (slots.every(Boolean)) break;              // 真的满了
  }
  return { seat: -1, slots };
}

/* 被驱逐后的自愈：滞后视图会让后来者以为自己占的是空席，从而把先到者覆盖掉
   （谁先写谁被驱逐）。既然该存储没有原子的 test-and-set，只能让被驱逐者补占。
   两个保护措施，避免「一人占两席」：
     1) 必须连续多次读到「自己不在座」且「确实有空席」才动手；
     2) 补占后再反向核对，若发现自己在别处也有一份，就把新写的这一席让出来。 */
/* 同一令牌出现在两个席位时，后一席是并发写入留下的多余占位：
   该玩家在靠前的席位已经坐好，因此让出这一席是安全的。
   没有这条回收规则，多余占位会让房间看起来已满，被驱逐者就永远补不进来。 */
function duplicateSeatIndex(slots) {
  const seen = new Set();
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s || !s.token) continue;
    if (seen.has(s.token)) return i;
    seen.add(s.token);
  }
  return -1;
}

async function selfHealSeat(code, token, name) {
  for (let i = 0; i < 4; i++) {
    const fresh = await readSlots(code, { attempts: 2, gapMs: 400 });
    const mine = fresh.findIndex(s => s && s.token === token);
    if (mine >= 0) return mine;
    const dup = duplicateSeatIndex(fresh);
    if (dup >= 0) {                                // 收回多余占位
      await writeSeat(code, dup, { token, name, ready: false, ts: stamp() });
      return dup;
    }
    if (fresh.every(Boolean)) return -1;          // 席位都有人，可能只是自己没读到，别乱写
    await sleep(400);
  }
  const picked = await claimSeat(code, token, name);
  if (picked.seat < 0) return -1;
  const after = await readSlots(code, { attempts: 2, gapMs: 400 });
  const first = after.findIndex(s => s && s.token === token);
  if (first >= 0 && first !== picked.seat) {      // 确实有两份，让出新写的那一席
    try { await store.delete(seatKey(code, picked.seat)); } catch { /* 忽略 */ }
    return first;
  }
  return picked.seat;
}

function publicState(code, slots, game, seat) {
  return {
    code,
    seat,
    players: slots.map((s, i) => s
      ? { name: s.name, ready: !!s.ready, seat: i, cards: game ? game.hands[i].length : undefined }
      : null),
    started: !!game,
    game: game && {
      level: game.level, levels: game.levels, round: game.round, phase: game.phase, turn: game.turn,
      top: game.top && { seat: game.top.seat, p: game.top.p, cards: game.top.cards },
      finished: game.finished, history: game.history.slice(-30), returns: game.returns,
      hand: (seat >= 0 ? game.hands[seat] : undefined),
      last: game.last, result: game.result, champion: game.champion
    }
  };
}

async function freeCode() {
  for (let n = 0; n < 10; n++) {
    const c = String(Math.floor(100000 + Math.random() * 900000));
    if (!(await getJson(roomKey(c)))) return c;
  }
  throw new Error('房间号生成失败，请重试');
}

/* 任意玩家读到「四席齐且全部准备」即可冻结名单并发牌。
   房间记录是整条写入的，谁最后写谁生效，所有人之后读到的都是同一份，
   因此不会出现“两人各开一局”的不一致。 */
async function maybeStart(code, slots, room) {
  if (room && room.game) return room;
  if (!slots.every(s => s && s.ready)) return room;
  const fresh = await readRoom(code);
  if (fresh && fresh.game) return fresh;
  const r = fresh || { code, created: Date.now(), roster: null, game: null };
  r.roster = slots.map(s => s.token);
  r.hostToken = slots[0].token;
  r.game = GD.newGame();
  await saveRoom(r);
  return r;
}

exports.handler = async event => {
  try {
    await ensureStore(event);
    // 真实运行时的 event.path 不含查询串，这里也兼容被塞进查询串的情况
    const rawPath = event.path || '';
    const [pathOnly, pathQuery] = rawPath.split('?');
    const route = pathOnly.split('/').pop();
    const method = event.httpMethod;
    let body = {};
    if (event.body) {
      try { body = JSON.parse(event.body); } catch { return error('请求格式错误'); }
    }
    const queryCode = (event.queryStringParameters && event.queryStringParameters.code)
      || new URLSearchParams(pathQuery || '').get('code') || '';
    const token = ((event.headers.authorization || event.headers.Authorization || '')
      .replace(/^Bearer\s+/i, '')) || String(body.token || '');

    /* ---- 建房 ---- */
    if (route === 'create' && method === 'POST') {
      if (body.password !== 'gina') return error('口令不正确', 403);
      const code = await freeCode();
      const myToken = id();
      await writeSeat(code, 0, { token: myToken, name: String(body.name || '牌友').slice(0, 16), ready: false, ts: stamp() });
      await saveRoom({ code, created: Date.now(), roster: null, game: null });
      for (let i = 0; i < 5; i++) {                 // 尽力确认可读再返回
        if (await getJson(seatKey(code, 0))) break;
        await sleep(900);
      }
      const slots = await readSlots(code);
      sessionCache.set(myToken, { code, seat: 0, at: Date.now() });
      return response(200, { ok: true, token: myToken, state: publicState(code, slots, null, 0) });
    }

    /* ---- 加入 ---- */
    if (route === 'join' && method === 'POST') {
      if (body.password !== 'gina') return error('口令不正确', 403);
      const code = String(body.code || '').trim();
      if (!/^\d{6}$/.test(code)) return error('房间号应为 6 位数字');
      const room = await readRoom(code, { attempts: 4, gapMs: 400 });
      let slots = await readSlots(code, { attempts: 4, gapMs: 400 });
      if (!room && !slots.some(Boolean)) return error('房间不存在', 404);

      // 带旧令牌回来的玩家必须回原座，绝不新占一席
      const known = token || body.token;
      let seat = known ? slots.findIndex(s => s && s.token === known) : -1;
      if (seat >= 0) {
        return response(200, { ok: true, token: known, state: publicState(code, slots, room && room.game, seat) });
      }
      if (room && room.game) return error('牌局已开始，无法加入新玩家');

      const myToken = id();
      const picked = await claimSeat(code, myToken, String(body.name || '牌友').slice(0, 16), slots);
      if (picked.seat < 0) return error('房间已满');
      slots = await readSlots(code, { attempts: 1 });
      if (!slots[picked.seat] || slots[picked.seat].token !== myToken) {
        slots[picked.seat] = { token: myToken, name: String(body.name || '牌友').slice(0, 16), ready: false, ts: stamp() };
      }
      sessionCache.set(myToken, { code, seat: picked.seat, at: Date.now() });
      return response(200, { ok: true, token: myToken, state: publicState(code, slots, room && room.game, picked.seat) });
    }

    /* ---- 以下都需要有效会话 ----
       会话定位只用「本人专属键」，不依赖 list()：
         token:<令牌>        → { code, seat }
         seat:<房间号>:<席>  → { token, name, ready }
       若座位键里已经没有自己（说明被并发抢座覆盖过），会自动重新占一个空席（自愈）。 */
    const explicitCode = String(body.code || queryCode || '').trim();
    let code = '', seat = -1, slots = null, room = null, self = null;

    const cached = token ? sessionCache.get(token) : null;
    if (cached && Date.now() - cached.at < SESSION_TTL) code = cached.code;
    if (!code) {
      const mapped = token ? await getJsonRetry('token:' + token, { attempts: 6, gapMs: 400 }) : null;
      if (mapped && mapped.code) code = String(mapped.code);
      else if (explicitCode) code = explicitCode;
    }
    if (!code) return error('会话无效或已过期', 401);

    room = await readRoom(code, { attempts: 1 });
    slots = await readSlots(code, { attempts: 3, gapMs: 400 });
    seat = slots.findIndex(s => s && s.token === token);
    if (seat < 0) {
      // 可能只是读滞后，也可能座位确实被并发加入者覆盖过；由 selfHealSeat 判断
      const healed = await selfHealSeat(code, token, '牌友');
      if (healed < 0) return error('会话无效或已过期', 401);
      seat = healed;
      slots = await readSlots(code, { attempts: 2, gapMs: 400 });
      if (!slots[seat] || slots[seat].token !== token) {
        slots[seat] = { token, name: '牌友', ready: false, ts: stamp() };
      }
    }
    self = slots[seat];
    sessionCache.set(token, { code, seat, at: Date.now() });

    /* ---- 状态 / 重连：任意玩家都可触发开局 ---- */
    if ((route === 'state' && (method === 'GET' || method === 'POST')) || (route === 'reconnect' && method === 'POST')) {
      const started = await maybeStart(code, slots, room);
      if (started && started !== room) {
        room = started;
        if (room.roster) {
          const idx = room.roster.indexOf(token);
          if (idx >= 0) seat = idx;
          slots = await readSlots(code, { attempts: 3, gapMs: 400 });
        }
      }
      return response(200, { ok: true, token, state: publicState(code, slots, room && room.game, seat) });
    }

    if (route !== 'action' || method !== 'POST') return error('未找到', 404);

    if (body.type === 'ready') {
      if (room && room.game) return error('牌局已开始');
      // 只写自己那一席：并发准备不会互相覆盖
      await writeSeat(code, seat, { ...self, ready: !!body.ready });
      slots[seat] = { ...self, ready: !!body.ready };
      const fresh = await readSlots(code, { attempts: 3, gapMs: 400 });
      const started = await maybeStart(code, fresh, room);
      if (started && started !== room) {
        room = started;
        if (room.roster) {
          const idx = room.roster.indexOf(token);
          if (idx >= 0) seat = idx;
        }
      }
      return response(200, { ok: true, state: publicState(code, fresh, room && room.game, seat) });
    }

    /* 出牌类操作：轮流进行，同一时刻只有一个写者 */
    const game = room && room.game;
    if (!game) return error('牌局尚未开始');
    if (body.type === 'play') {
      const ids = body.ids || [];
      // 贡还阶段必须走 giveBack：act() 只在 play 阶段有效，
      // 统一走 act 会抛“还没轮到你出牌”，导致第二副永远卡在还贡
      if (game.phase === 'return') {
        if (ids.length !== 1) return error('还贡只能选择一张牌');
        GD.giveBack(game, seat, ids[0]);
      } else {
        GD.act(game, seat, ids, body.key);
      }
    } else if (body.type === 'pass') {
      GD.act(game, seat, []);
    } else if (body.type === 'next') {
      const hostToken = room.hostToken || (slots[0] && slots[0].token);
      if (hostToken && hostToken !== token) return error('仅房主可开下一副');
      if (game.phase !== 'over') return error('本副尚未结束');
      GD.deal(game);
    } else {
      return error('未知操作');
    }
    await saveRoom(room);
    return response(200, { ok: true, state: publicState(code, slots, game, seat) });
  } catch (e) {
    return error(e.message || '服务错误');
  }
};
