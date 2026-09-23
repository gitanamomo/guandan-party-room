'use strict';
/**
 * GINA 牌友会 · 掼蛋在线多人联机引擎
 * 架构：
 * 1. WebRTC P2P 直连（PeerJS）：房主作为权威 Host，其他玩家直连，0 成本、零延迟、永久免费。
 * 2. 备用 HTTP 模式：兼容现有 server.cjs（局域网/自建服务器）。
 * 3. 完整移植 v2 暖色会所场景视效、声效、座位朝向映射、15s 超时 AI 托管与滑动批量选牌。
 */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// 核心状态
let mySeat = -1;
let myToken = '';
let myName = localStorage.getItem('ginaPlayerName') || '牌友';
let roomCode = '';
let isHost = false;
let isP2P = true;
let aiAuto = false;

// 游戏状态与选牌
let gameState = null; // 当前公开的房间与对局状态
let chosenCards = new Set();
let soundOn = false;
let audioCtx = null;
let turnCountdown = 15;
let turnTimer = null;

// P2P 实例与连接表
let peer = null;
let hostConn = null; // Client 连向 Host 的 DataConnection
let clientConns = new Map(); // Host 端记录各 Seat 的 DataConnection: seat -> conn

// Host 专用的权威状态
let hostData = {
  game: null,
  players: [null, null, null, null], // { seat, name, token, ready, isBot, aiManaged, lastActive }
  history: [],
  previous: null
};

// 备用 HTTP 模式轮询
let httpPollTimer = null;

/* ---------------- 音频合成器（Web Audio API） ---------------- */
function playSound(type = 'card') {
  if (!soundOn) return;
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    if (type === 'card') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(360, t);
      osc.frequency.exponentialRampToValueAtTime(160, t + 0.09);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    } else if (type === 'pass') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.12);
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    } else if (type === 'win') {
      [330, 440, 550, 660].forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(freq, t + idx * 0.08);
        g.gain.setValueAtTime(0.06, t + idx * 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.08 + 0.15);
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start(t + idx * 0.08);
        o.stop(t + idx * 0.08 + 0.16);
      });
    }
  } catch { /* 忽略音频限制 */ }
}

/* ---------------- Toast 提示 ---------------- */
let toastTimeout;
function showToast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => t.classList.remove('show'), 2400);
}

function updateNetBadge(text, state = 'ok') {
  const b = $('#net-status-badge');
  if (!b) return;
  b.className = 'net-status' + (state === 'warn' ? ' warn' : state === 'err' ? ' err' : '');
  b.innerHTML = `<span style="font-size:9px">●</span> ${text}`;
}

/* ---------------- 牌面辅助函数 ---------------- */
function cardText(c) {
  if (!c) return '';
  return c.r >= 16 ? GD.label(c.r) : c.s + GD.label(c.r);
}

function cardDesc(p) {
  if (!p) return '';
  return p.type + ' · ' + (p.type === '四王炸' ? '大小王各两张' : p.rs.map(GD.label).join(' '));
}

/* ---------------- 座位视角相对计算 ---------------- */
// 无论自己分配到 0/1/2/3 号座位，自己永远在南侧（下方），对家永远在北侧（上方），左家在西，右家在东
function getActualSeat(relativeIndex) {
  if (mySeat < 0) return relativeIndex;
  return (mySeat + relativeIndex) % 4;
}

function getRelativeIndex(actualSeat) {
  if (mySeat < 0) return actualSeat;
  return (actualSeat - mySeat + 4) % 4;
}

/* ---------------- 界面渲染流水线 ---------------- */
function render() {
  renderSeats();
  renderTable();
  renderStatus();
  renderControls();
  renderHand();
  renderSummary();
  renderHistory();
  renderLobbyModal();
}

function renderLobbyModal() {
  const modal = $('#lobby-modal');
  const loginFields = $('#lobby-login-fields');
  const loginActions = $('#lobby-login-actions');
  const waitingArea = $('#lobby-waiting-area');
  const inGame = gameState && gameState.started;

  if (inGame) {
    modal.hidden = true;
    return;
  }

  modal.hidden = false;
  if (!roomCode) {
    // 尚未加入房间
    loginFields.style.display = 'flex';
    loginActions.style.display = 'flex';
    waitingArea.style.display = 'none';
  } else {
    // 已在房间，等待开局
    loginFields.style.display = 'none';
    loginActions.style.display = 'none';
    waitingArea.style.display = 'block';

    $('#display-room-code').textContent = roomCode;
    const list = $('#waiting-players-list');
    list.replaceChildren();

    const players = gameState?.players || [];
    for (let i = 0; i < 4; i++) {
      const p = players[i];
      const li = document.createElement('li');
      const isMe = i === mySeat;
      const isTeammate = mySeat >= 0 && (mySeat + 2) % 4 === i;
      let label = `${i + 1}号位`;
      if (i === 0) label += '（房主）';
      if (isMe) label += '（你）';
      else if (isTeammate) label += '（对家）';

      if (p) {
        li.innerHTML = `<span>${label} · <strong>${p.name}</strong>${p.isBot ? ' 🤖' : ''}</span>
                        <span class="${p.ready ? 'tag-ready' : 'tag-wait'}">${p.ready ? '已就绪' : '等待准备'}</span>`;
      } else {
        li.innerHTML = `<span>${label}</span><span class="tag-wait">空席</span>`;
      }
      list.append(li);
    }

    const me = players[mySeat];
    const readyBtn = $('#btn-ready-toggle');
    if (readyBtn) {
      readyBtn.textContent = me?.ready ? '取消准备' : '点此准备';
      readyBtn.className = me?.ready ? '' : 'primary';
    }

    const addBotBtn = $('#btn-add-bot');
    if (addBotBtn) {
      addBotBtn.style.display = isHost ? 'inline-block' : 'none';
    }
  }
}

function renderSeats() {
  const g = gameState?.game;
  const players = gameState?.players || [];

  for (let rel = 0; rel < 4; rel++) {
    const actSeat = getActualSeat(rel);
    const el = $('#seat' + rel);
    if (!el) continue;

    const p = players[actSeat];
    if (!p) {
      el.replaceChildren();
      const n = document.createElement('strong');
      n.textContent = (actSeat + 1) + '号位 (空座)';
      const s = document.createElement('span');
      s.textContent = '等待加入…';
      el.append(n, s);
      el.classList.remove('active', 'bot');
      continue;
    }

    const isMe = actSeat === mySeat;
    const isTeammate = mySeat >= 0 && (mySeat + 2) % 4 === actSeat;
    let nameStr = p.name;
    if (isMe) nameStr += '（你）';
    else if (isTeammate) nameStr += ' · 队友';

    let cardCountText = p.ready ? '已准备' : '未准备';
    if (g && p.cards !== undefined) {
      const place = (g.finished || []).indexOf(actSeat);
      if (place >= 0) {
        cardCountText = g.result?.double && place > 1 ? '双下' : ['头游', '二游', '三游', '末游'][place];
      } else {
        cardCountText = `余 ${p.cards} 张`;
      }
    }

    let lastAction = actSeat % 2 === 0 ? '青松队' : '暖阳队';
    if (g && g.last && g.last[actSeat]) {
      const l = g.last[actSeat];
      lastAction = l.pass ? '不要' : (l.p?.type || '出牌');
    }

    // 行动权角标
    let chip = '';
    const isTurn = g && g.phase === 'play' && g.turn === actSeat;
    const isReturn = g && g.phase === 'return' && (g.returns || []).some(r => r.from === actSeat);
    if (isReturn) chip = '还贡';
    else if (isTurn) chip = g.top ? '轮到' : '领出';

    el.innerHTML = `<strong>${nameStr}</strong>
                    <span>${cardCountText}</span>
                    <em>${lastAction}</em>
                    <span class="turn-chip">${chip}</span>
                    <span class="badge-bot">🤖 托管</span>`;

    const active = isTurn || isReturn;
    el.classList.toggle('active', !!active);
    el.classList.toggle('bot', !!(p.isBot || p.aiManaged));
  }
}

function renderTable() {
  const g = gameState?.game;
  const msgEl = $('#table-message');
  const cardsBox = $('#table-cards');

  if (!gameState || !gameState.started || !g) {
    msgEl.textContent = roomCode ? `房间 ${roomCode} · 等待四席就绪` : '准备好，就开一桌。';
    cardsBox.replaceChildren();
    return;
  }

  if (g.phase === 'over') {
    msgEl.textContent = '本副结束 · 等待房主开下一副';
  } else if (g.phase === 'return') {
    msgEl.textContent = '贡牌已送达 · 正在还贡';
  } else if (g.top) {
    const actSeat = g.top.seat;
    const pName = gameState.players[actSeat]?.name || (actSeat + 1) + '号';
    msgEl.textContent = `${pName} · ${cardDesc(g.top.p)}`;
  } else {
    const actSeat = g.turn;
    const pName = gameState.players[actSeat]?.name || (actSeat + 1) + '号';
    msgEl.textContent = `${pName} 领出 · 请选择牌型`;
  }

  // 渲染桌面出的牌
  cardsBox.replaceChildren();
  if (g.top && g.top.cards && g.top.cards.length) {
    const group = document.createElement('div');
    group.className = 'group';
    group.dataset.seat = getRelativeIndex(g.top.seat);
    g.top.cards.forEach((c, idx) => {
      const el = document.createElement('span');
      el.className = 'tiny' + (['♥', '♦'].includes(c.s) || c.r === 17 ? ' red' : '');
      el.textContent = cardText(c);
      el.style.setProperty('--i', String(Math.min(idx, 5)));
      group.append(el);
    });
    cardsBox.append(group);
  }
}

function renderStatus() {
  const g = gameState?.game;
  if (!g) {
    $('#ours').textContent = '2';
    $('#theirs').textContent = '2';
    $('#round').textContent = '第 1 副 · 等待就绪';
    $('#level').textContent = '2';
    $('#wildlabel').textContent = '红桃 2 是逢人配';
    return;
  }
  $('#ours').textContent = GD.label(g.levels ? g.levels[0] : 2);
  $('#theirs').textContent = GD.label(g.levels ? g.levels[1] : 2);
  $('#round').textContent = `第 ${g.round || 1} 副 · ${g.phase === 'over' ? '下副打' : '当前打'}`;
  $('#level').textContent = GD.label(g.level);
  $('#wildlabel').textContent = `红桃 ${GD.label(g.level)} 是逢人配`;
}

function renderControls() {
  const g = gameState?.game;
  const isMyTurn = g && g.phase === 'play' && g.turn === mySeat;
  const isMyReturn = g && g.phase === 'return' && (g.returns || []).some(r => r.from === mySeat);

  $('#play').disabled = isMyReturn ? chosenCards.size !== 1 : !isMyTurn || !chosenCards.size;
  $('#play').textContent = isMyReturn ? '确认还贡' : '出牌';
  $('#pass').disabled = isMyReturn || !isMyTurn || !g.top;
  $('#suggest').disabled = !isMyTurn && !isMyReturn;
  $('#next').hidden = !(isHost && g && g.phase === 'over');

  const me = gameState?.players?.[mySeat];
  $('#aside-ready').textContent = me?.ready ? '取消准备' : '准备';

  // 智能提示文本
  const hintEl = $('#hint');
  if (isMyReturn) {
    hintEl.textContent = '请选择一张允许的牌还贡（≤10非级牌；没有则还最小牌）';
  } else if (g && g.phase === 'over') {
    hintEl.textContent = isHost ? '本副结束，点击“下一副”继续' : '本副结束，等待房主开下一副';
  } else if (isMyTurn) {
    hintEl.textContent = g.top ? '轮到你出牌，可压牌或点不要' : '轮到你领出，不能不要';
  } else if (g) {
    const curName = gameState.players[g.turn]?.name || (g.turn + 1) + '号';
    hintEl.textContent = `等待 ${curName} 出牌…`;
  } else {
    hintEl.textContent = '四人均点击准备后自动发牌';
  }

  // 牌型解释下拉框
  selection();
}

function selection() {
  const g = gameState?.game;
  const box = $('#interpretation');
  if (!g || !g.hand) {
    box.hidden = true;
    return;
  }
  const isMyReturn = g.phase === 'return' && (g.returns || []).some(r => r.from === mySeat);
  if (isMyReturn) {
    box.hidden = true;
    return;
  }

  const selectedCards = g.hand.filter(c => chosenCards.has(c.id));
  const opts = GD.classify(selectedCards, g.level).filter(p => GD.beats(p, g.top?.p));
  const oldVal = box.value;
  box.replaceChildren();

  opts.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.key;
    opt.textContent = cardDesc(p);
    box.append(opt);
  });

  if (opts.some(p => p.key === oldVal)) box.value = oldVal;
  box.hidden = !opts.length;
}

function renderHand() {
  const handBox = $('#hand');
  const g = gameState?.game;
  if (!g || !g.hand || !g.hand.length) {
    handBox.replaceChildren();
    $('#hand-title').textContent = '你的手牌 · 0 张';
    return;
  }

  $('#hand-title').textContent = `你的手牌 · ${g.hand.length} 张`;
  const scrollLeft = handBox.scrollLeft;

  // 检查是否已有节点进行增量更新或重建
  handBox.replaceChildren();
  g.hand.forEach(c => {
    const btn = document.createElement('button');
    const isRed = ['♥', '♦'].includes(c.s) || c.r === 17;
    const isSelected = chosenCards.has(c.id);
    btn.className = 'card' + (isRed ? ' red' : '');
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.dataset.id = c.id;

    btn.append(document.createTextNode(GD.label(c.r)));
    if (c.r >= 16) btn.style.fontSize = '14px';

    const sm = document.createElement('small');
    sm.textContent = c.r < 16 ? c.s : '★';
    btn.append(sm);

    if (c.r === g.level) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = GD.wild(c, g.level) ? '逢人配' : '级牌';
      btn.append(badge);
    }

    btn.onclick = () => {
      toggleCard(c.id);
      playSound('card');
    };

    handBox.append(btn);
  });

  handBox.scrollLeft = scrollLeft;
  setupHandSwipeSelection();
}

function toggleCard(cardId) {
  if (chosenCards.has(cardId)) chosenCards.delete(cardId);
  else chosenCards.add(cardId);
  renderHandSelection();
  renderControls();
}

function renderHandSelection() {
  $$('#hand .card').forEach(btn => {
    const cid = btn.dataset.id;
    btn.setAttribute('aria-pressed', String(chosenCards.has(cid)));
  });
}

function renderSummary() {
  const sum = $('#summary');
  const g = gameState?.game;
  if (!g || g.phase !== 'over') {
    sum.hidden = true;
    return;
  }
  sum.hidden = false;
  const r = g.result;
  const names = (gameState.players || []).map(p => p?.name || '未知');
  sum.textContent = `${r.team === 0 ? '青松队' : '暖阳队'}获胜 · ${
    r.double ? '双上，升3级' : r.order.map((s, i) => `${['头游', '二游', '三游', '末游'][i]}：${names[s]}`).join(' / ') + ' · 升' + r.up + '级'
  }${g.champion !== undefined ? ' · 成功过A，本场结束！' : ''}`;
}

function renderHistory() {
  const box = $('#history');
  box.replaceChildren();
  const hist = (gameState?.game?.history || []).slice(-16).reverse();
  const players = gameState?.players || [];

  hist.forEach(line => {
    const d = document.createElement('div');
    d.textContent = line.replace(/([1-4])号/g, (_, num) => {
      const idx = Number(num) - 1;
      return players[idx]?.name || (idx + 1) + '号';
    });
    box.append(d);
  });
}

/* ---------------- 手牌滑动连续选牌手势 ---------------- */
let isSwiping = false;
let swipeAction = null; // 'select' | 'deselect'
function setupHandSwipeSelection() {
  const hand = $('#hand');
  if (!hand || hand._swipeInit) return;
  hand._swipeInit = true;

  hand.addEventListener('pointerdown', e => {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    isSwiping = true;
    const cid = cardEl.dataset.id;
    swipeAction = chosenCards.has(cid) ? 'deselect' : 'select';
  });

  window.addEventListener('pointermove', e => {
    if (!isSwiping) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cardEl = el?.closest('#hand .card');
    if (cardEl) {
      const cid = cardEl.dataset.id;
      if (swipeAction === 'select' && !chosenCards.has(cid)) {
        chosenCards.add(cid);
        renderHandSelection();
        renderControls();
        playSound('card');
      } else if (swipeAction === 'deselect' && chosenCards.has(cid)) {
        chosenCards.delete(cid);
        renderHandSelection();
        renderControls();
        playSound('card');
      }
    }
  });

  window.addEventListener('pointerup', () => { isSwiping = false; });
  window.addEventListener('pointercancel', () => { isSwiping = false; });
}

/* ---------------- 权威 Host 业务逻辑（P2P 模式） ---------------- */
function initHostGame(code) {
  isHost = true;
  roomCode = code;
  mySeat = 0;
  myToken = 'host-' + Math.random().toString(36).slice(2);

  hostData.players = [
    { seat: 0, name: myName, token: myToken, ready: false, isBot: false, aiManaged: false, lastActive: Date.now() },
    null, null, null
  ];
  hostData.game = null;
  hostData.history = [];

  broadcastHostState();
}

function handleHostJoin(conn, data) {
  const { name, token } = data;
  const pName = String(name || '牌友').slice(0, 12);
  let seat = hostData.players.findIndex(p => p && p.token === token);

  if (seat < 0) {
    if (hostData.game) {
      conn.send({ type: 'error', message: '牌局已开始，无法中途入座' });
      return;
    }
    seat = hostData.players.findIndex(p => !p);
    if (seat < 0) {
      conn.send({ type: 'error', message: '房间已满员' });
      return;
    }
    const userToken = token || ('tok-' + Math.random().toString(36).slice(2));
    hostData.players[seat] = {
      seat,
      name: pName,
      token: userToken,
      ready: false,
      isBot: false,
      aiManaged: false,
      lastActive: Date.now()
    };
  } else {
    // 重连回原座位
    hostData.players[seat].name = pName;
    hostData.players[seat].lastActive = Date.now();
  }

  clientConns.set(seat, conn);

  conn.send({
    type: 'welcome',
    seat,
    code: roomCode,
    token: hostData.players[seat].token
  });

  broadcastHostState();
}

function handleHostAction(seat, action) {
  const p = hostData.players[seat];
  if (!p) return;
  p.lastActive = Date.now();
  const g = hostData.game;

  if (action.type === 'ready') {
    if (g) return;
    p.ready = !!action.ready;
    checkHostStart();
  } else if (action.type === 'play') {
    if (!g) return;
    const ids = action.ids || [];
    if (g.phase === 'return') {
      if (ids.length !== 1) return;
      GD.giveBack(g, seat, ids[0]);
    } else {
      GD.act(g, seat, ids, action.key);
    }
    p.aiManaged = false;
    checkHostTurn();
  } else if (action.type === 'pass') {
    if (!g) return;
    GD.act(g, seat, []);
    p.aiManaged = false;
    checkHostTurn();
  } else if (action.type === 'next') {
    if (seat !== 0 || !g || g.phase !== 'over') return;
    GD.deal(g);
    checkHostTurn();
  } else if (action.type === 'aiToggle') {
    p.aiManaged = !p.aiManaged;
    if (p.aiManaged && g && g.turn === seat) {
      triggerBotAction(seat);
    }
  }

  broadcastHostState();
}

function checkHostStart() {
  if (hostData.game) return;
  const readyCount = hostData.players.filter(p => p && p.ready).length;
  if (readyCount === 4) {
    hostData.game = GD.newGame();
    broadcastHostState();
    checkHostTurn();
  }
}

function checkHostTurn() {
  clearTimeout(turnTimer);
  const g = hostData.game;
  if (!g) return;

  if (g.phase === 'over') {
    playSound('win');
    broadcastHostState();
    return;
  }

  let activeSeat = g.phase === 'return'
    ? g.returns.find(x => x.from !== undefined)?.from
    : g.turn;

  if (activeSeat === undefined) return;
  const p = hostData.players[activeSeat];

  // 15 秒超时守护
  turnCountdown = 15;
  turnTimer = setTimeout(() => {
    // 超时自动调用 AI
    triggerBotAction(activeSeat);
  }, 15000);

  // 如果是电脑人或已开启托管，800ms 后立即代打
  if (p && (p.isBot || p.aiManaged)) {
    setTimeout(() => triggerBotAction(activeSeat), 800);
  }
}

function triggerBotAction(seat) {
  const g = hostData.game;
  if (!g) return;
  const isTurn = g.phase === 'play' && g.turn === seat;
  const isReturn = g.phase === 'return' && (g.returns || []).some(r => r.from === seat);
  if (!isTurn && !isReturn) return;

  try {
    if (isReturn) {
      const choice = GD.returnChoices(g, seat)[0];
      if (choice) GD.giveBack(g, seat, choice.id);
    } else {
      GD.bot(g, seat);
    }
    const p = hostData.players[seat];
    if (p && !p.isBot) p.aiManaged = true;
    checkHostTurn();
    broadcastHostState();
  } catch (e) {
    console.error('Bot action error:', e);
  }
}

function getPublicGameState(forSeat) {
  const g = hostData.game;
  return {
    code: roomCode,
    seat: forSeat,
    started: !!g,
    players: hostData.players.map((p, i) => p ? {
      seat: i,
      name: p.name,
      ready: p.ready,
      cards: g ? g.hands[i]?.length : 0,
      isBot: p.isBot,
      aiManaged: p.aiManaged
    } : null),
    game: g ? {
      level: g.level,
      levels: g.levels,
      round: g.round,
      phase: g.phase,
      turn: g.turn,
      top: g.top ? { seat: g.top.seat, p: g.top.p, cards: g.top.cards } : null,
      finished: g.finished,
      history: g.history.slice(-30),
      returns: g.returns,
      hand: forSeat >= 0 ? g.hands[forSeat] : [],
      last: g.last,
      result: g.result,
      champion: g.champion
    } : null
  };
}

function broadcastHostState() {
  // Host 自身更新
  gameState = getPublicGameState(0);
  render();

  // 广播给每个客户端（私有手牌安全保护）
  clientConns.forEach((conn, seat) => {
    if (conn && conn.open) {
      conn.send({
        type: 'state',
        state: getPublicGameState(seat)
      });
    }
  });
}

/* ---------------- WebRTC P2P 网络初始化 ---------------- */
function startP2PHost(code) {
  const peerId = 'gina-gd-' + code;
  updateNetBadge('正在创建 P2P 房间…', 'warn');

  peer = new Peer(peerId, { debug: 1 });
  peer.on('open', id => {
    updateNetBadge('🟢 P2P 直连已就绪', 'ok');
    initHostGame(code);
    saveSession();
    showToast('房间已创建！把房间号或链接发给牌友即可对战');
  });

  peer.on('connection', conn => {
    conn.on('data', msg => {
      if (msg.type === 'join') {
        handleHostJoin(conn, msg);
      } else if (msg.type === 'action') {
        const seat = [...clientConns.entries()].find(([_, c]) => c === conn)?.[0];
        if (seat !== undefined) handleHostAction(seat, msg.action);
      }
    });

    conn.on('close', () => {
      const seat = [...clientConns.entries()].find(([_, c]) => c === conn)?.[0];
      if (seat !== undefined && hostData.players[seat]) {
        hostData.players[seat].aiManaged = true; // 掉线由电脑自动托管
        broadcastHostState();
      }
    });
  });

  peer.on('error', err => {
    console.error('PeerJS error:', err);
    if (err.type === 'unavailable-id') {
      $('#lobby-err').textContent = '房间号被占用，请换一个房间号重试';
    } else {
      updateNetBadge('网络微弱，尝试备用模式…', 'warn');
      fallbackToHttpMode();
    }
  });
}

function startP2PClient(code) {
  roomCode = code;
  updateNetBadge('正在加入 P2P 房间…', 'warn');

  peer = new Peer({ debug: 1 });
  peer.on('open', () => {
    const hostPeerId = 'gina-gd-' + code;
    hostConn = peer.connect(hostPeerId, { reliable: true });

    hostConn.on('open', () => {
      updateNetBadge('🟢 P2P 直连已就绪', 'ok');
      hostConn.send({
        type: 'join',
        name: myName,
        token: myToken
      });
    });

    hostConn.on('data', msg => {
      if (msg.type === 'welcome') {
        mySeat = msg.seat;
        myToken = msg.token;
        saveSession();
        showToast(`已成功入座 ${mySeat + 1} 号席位！`);
      } else if (msg.type === 'state') {
        gameState = msg.state;
        render();
      } else if (msg.type === 'error') {
        $('#lobby-err').textContent = msg.message;
        updateNetBadge('加入失败', 'err');
      }
    });

    hostConn.on('close', () => {
      updateNetBadge('与房主直连已断开', 'err');
      showToast('连接已断开，正在尝试重连…');
    });
  });

  peer.on('error', err => {
    console.error('P2P Client Error:', err);
    updateNetBadge('P2P 连接受阻，尝试服务器模式…', 'warn');
    fallbackToHttpMode();
  });
}

/* ---------------- 客户端向 Host 发送操作 ---------------- */
function dispatchAction(action) {
  if (isHost) {
    handleHostAction(0, action);
  } else if (isP2P && hostConn && hostConn.open) {
    hostConn.send({ type: 'action', action });
  } else {
    // HTTP API 备用模式
    sendHttpAction(action);
  }
}

/* ---------------- 备用 HTTP 模式支持（server.cjs） ---------------- */
function fallbackToHttpMode() {
  isP2P = false;
  updateNetBadge('切换到服务器模式', 'ok');
  startHttpPolling();
}

async function sendHttpAction(action) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + myToken },
      body: JSON.stringify({ ...action, code: roomCode })
    });
    const data = await res.json();
    if (data.ok) {
      gameState = data.state;
      render();
    } else {
      showToast(data.error || '操作失败');
    }
  } catch (e) {
    showToast('网络请求异常');
  }
}

function startHttpPolling() {
  clearInterval(httpPollTimer);
  httpPollTimer = setInterval(async () => {
    if (!roomCode || !myToken) return;
    try {
      const res = await fetch(`/api/state?code=${encodeURIComponent(roomCode)}`, {
        headers: { authorization: 'Bearer ' + myToken }
      });
      const data = await res.json();
      if (data.ok) {
        gameState = data.state;
        render();
      }
    } catch { /* 忽略瞬时轮询失败 */ }
  }, 1200);
}

/* ---------------- 会话持久化与房间恢复 ---------------- */
function saveSession() {
  try {
    localStorage.setItem('ginaGuandanSession', JSON.stringify({
      code: roomCode,
      seat: mySeat,
      token: myToken,
      isHost,
      name: myName
    }));
  } catch { /* 忽略 */ }
}

function clearSession() {
  try {
    localStorage.removeItem('ginaGuandanSession');
  } catch { /* 忽略 */ }
}

/* ---------------- 按钮事件绑定 ---------------- */
function setupEvents() {
  // 创建房间
  $('#btn-create').onclick = () => {
    const nameVal = $('#player-name').value.trim();
    if (nameVal) {
      myName = nameVal;
      localStorage.setItem('ginaPlayerName', myName);
    }
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    startP2PHost(code);
  };

  // 加入房间
  $('#btn-join').onclick = () => {
    const nameVal = $('#player-name').value.trim();
    const codeVal = $('#room-code-input').value.trim().toUpperCase();
    if (!codeVal) {
      $('#lobby-err').textContent = '请输入房间号';
      return;
    }
    if (nameVal) {
      myName = nameVal;
      localStorage.setItem('ginaPlayerName', myName);
    }
    startP2PClient(codeVal);
  };

  // 准备与取消准备
  const toggleReady = () => {
    const p = gameState?.players?.[mySeat];
    dispatchAction({ type: 'ready', ready: !p?.ready });
  };
  $('#btn-ready-toggle').onclick = toggleReady;
  $('#aside-ready').onclick = toggleReady;

  // 房主添加电脑凑桌
  $('#btn-add-bot').onclick = () => {
    if (!isHost) return;
    const emptySeat = hostData.players.findIndex(p => !p);
    if (emptySeat < 0) {
      showToast('房间已满，无需添加电脑');
      return;
    }
    const botNames = ['电脑小禾', '电脑阿棠', '电脑老周', '智能牌友'];
    hostData.players[emptySeat] = {
      seat: emptySeat,
      name: botNames[emptySeat] || '电脑人',
      token: 'bot-' + Math.random().toString(36).slice(2),
      ready: true,
      isBot: true,
      aiManaged: true,
      lastActive: Date.now()
    };
    showToast(`已在 ${emptySeat + 1} 号席位安排电脑牌友`);
    checkHostStart();
    broadcastHostState();
  };

  // 出牌
  $('#play').onclick = () => {
    const g = gameState?.game;
    if (!g) return;
    const isMyReturn = g.phase === 'return' && (g.returns || []).some(r => r.from === mySeat);
    const chosenList = [...chosenCards];

    if (isMyReturn) {
      if (chosenList.length !== 1) {
        showToast('还贡必须选择且只选一张牌');
        return;
      }
      dispatchAction({ type: 'play', ids: chosenList });
    } else {
      const typeKey = $('#interpretation').value;
      dispatchAction({ type: 'play', ids: chosenList, key: typeKey });
    }
    chosenCards.clear();
    playSound('card');
  };

  // 不要
  $('#pass').onclick = () => {
    dispatchAction({ type: 'pass' });
    chosenCards.clear();
    playSound('pass');
  };

  // 提示压牌
  let suggestIdx = 0;
  $('#suggest').onclick = () => {
    const g = gameState?.game;
    if (!g || !g.hand) return;

    const isMyReturn = g.phase === 'return' && (g.returns || []).some(r => r.from === mySeat);
    if (isMyReturn) {
      const choices = GD.returnChoices(g, mySeat);
      if (choices.length) {
        chosenCards = new Set([choices.at(-1).id]);
        renderHandSelection();
        renderControls();
      }
      return;
    }

    const moves = GD.moves(g.hand, g.level, g.top?.p);
    moves.sort((a, b) => a.p.tier - b.p.tier || (g.top ? 0 : b.cards.length - a.cards.length) || a.p.score - b.p.score);
    if (!moves.length) {
      showToast('没有能压过的牌，可以选择“不要”');
      return;
    }
    const m = moves[suggestIdx++ % moves.length];
    chosenCards = new Set(m.cards.map(c => c.id));
    renderHandSelection();
    renderControls();
    $('#interpretation').value = m.p.key;
  };

  // 取消选择
  $('#clear').onclick = () => {
    chosenCards.clear();
    renderHandSelection();
    renderControls();
  };

  // 房主下一副
  $('#next').onclick = () => {
    dispatchAction({ type: 'next' });
    chosenCards.clear();
  };

  // 托管开关
  $('#ai-toggle').onclick = () => {
    aiAuto = !aiAuto;
    $('#ai-toggle').textContent = aiAuto ? '🤖 托管: 开' : '🤖 托管: 关';
    dispatchAction({ type: 'aiToggle' });
    showToast(aiAuto ? '已开启自动托管，电脑将帮你出牌' : '已关闭托管，恢复手动控制');
  };

  // 复制链接 / 房间号
  const copyShareUrl = () => {
    if (!roomCode) {
      showToast('请先创建或加入房间');
      return;
    }
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('邀请链接已复制，发给朋友即可直连进桌！');
    }).catch(() => {
      showToast(`房间号为：${roomCode}`);
    });
  };
  $('#nav-share').onclick = copyShareUrl;
  $('#aside-share').onclick = copyShareUrl;
  $('#btn-copy-code').onclick = () => {
    navigator.clipboard.writeText(roomCode).then(() => showToast(`房间号 ${roomCode} 已复制`));
  };

  // 退出房间
  const leaveRoom = () => {
    clearSession();
    location.href = location.pathname;
  };
  $('#btn-leave-room').onclick = leaveRoom;
  $('#aside-leave').onclick = leaveRoom;

  // 规则弹窗
  $('#nav-rules').onclick = () => $('#rules-modal').showModal();
  $('#aside-rules').onclick = () => $('#rules-modal').showModal();
  $('#close-rules').onclick = () => $('#rules-modal').close();

  // 声音控制
  const toggleSound = () => {
    soundOn = !soundOn;
    $('#nav-sound').textContent = '声音：' + (soundOn ? '开' : '关');
    $('#aside-sound').textContent = '声音：' + (soundOn ? '开' : '关');
    playSound('card');
  };
  $('#nav-sound').onclick = toggleSound;
  $('#aside-sound').onclick = toggleSound;
}

/* ---------------- 页面加载启动 ---------------- */
function init() {
  setupEvents();

  // 自动解析 URL 中的 ?room=XXXX 参数
  const params = new URLSearchParams(location.search);
  const urlRoom = params.get('room');
  if (urlRoom) {
    $('#room-code-input').value = urlRoom.trim().toUpperCase();
    showToast(`检测到邀请房间号 ${urlRoom}，填入名字即可加入`);
  }

  // 初始界面渲染
  render();
}

window.addEventListener('DOMContentLoaded', init);
