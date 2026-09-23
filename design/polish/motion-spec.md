# 动效与渲染结构方案 / Motion Spec

| 项 | 值 |
|---|---|
| Task ID | P6-ENG-01 |
| 角色 | engineering-lead（程基岩） |
| 优先级 | P0 |
| 状态 | 方案待评审（本轮**不改动任何代码文件**） |
| 范围 | `index.html`（CSS）、`app.js`（渲染层）。**`engine.js` 不动** |
| 目标浏览器 | macOS Safari / Chrome，iOS Safari |
| 上游决策 | 先修结构 + 核心四动效（用户已定，不推翻） |

---

## 0. 现状实测（本轮已复核，与问题陈述一致）

```
@keyframes           0 处
animation            0 处
requestAnimationFrame 0 处
transition           2 处  → .card{transition:transform .12s} + reduced-motion 的 none
will-change          0 处
```

全项目无构建、无框架；`engine.js` 为纯规则引擎（IIFE 暴露 `GD`）；`app.js` 顶部仅一行全局状态：

```js
const $=s=>document.querySelector(s),names=[...];
let game=GD.newGame(),selected=new Set(),timer,soundOn=false,audio;
```

### 0.1 关键事实（决定了方案的可行性边界）

**F1 — 卡片 id 全局稳定且唯一，并且跨副复用。**
`engine.js` 的 `deck()` 生成 `id = `${k}-${s}-${r}``（k∈{0,1} 两副牌，s∈♠♥♣♦，r=2..14/16/17），王为 `${k}-J-${r}`。**每一副新牌（`GD.deal`）生成的 108 个 id 与前一副完全相同。** 这是 diff 方案的基础，也是最大的隐蔽陷阱（见 R6）。

**F2 — 座位 `.seat` 元素本身从未被销毁，只有其子节点被替换。**
`app.js:9` 是 `el.replaceChildren()` 后重建 `strong / span / em`。因此 `.seat.active` 的 `classList.toggle` **已经作用在持久节点上** —— 轮转高亮不需要任何 diff，只需要 CSS。这是本轮性价比最高的一处。

**F3 — 全量重建的成本其实很低。**
一次 `render()` 约 27（手牌）+ 12（4×3 座位）+ ≤8（桌面）+ ≤18（history）≈ **65 个节点**，且最快每 750ms 一次。**改造的真实动机不是性能，而是"节点身份连续性"。** 若以性能为目标会做过度优化，请团队按此对齐。

**F4 — 手牌是负边距重叠布局。**
`.card{flex:0 0 58px;margin-right:-25px}` + `.card:last-child{margin-right:0}`。任何把"离场中的牌"留在 flex 流里的做法，都会让 `:last-child` 落到错误的元素上，产生 25px 的布局空洞（见 R2）。

**F5 — `.seat.north/.south` 自身已占用 `transform:translateX(-50%)` 做居中。**
**禁止在 `.seat` 元素本体上动画 transform**，会破坏居中定位。轮转高亮必须挂在 `::after` 伪元素上。

**F6 — `prefers-reduced-motion` 当前只覆盖 transition，且写法有隐患。**
现有 `@media(prefers-reduced-motion:reduce){*{transition:none!important}}`。若沿用 `animation:none!important` 的直觉写法，会导致 **`animationend` 永不触发**，使依赖该事件回收的离场节点/特效克隆泄漏（见 R9）。

**F7 — 出牌后手牌按钮被移除，键盘焦点会掉到 `<body>`。**
这是改造前就存在的无障碍缺陷，增量改造不会自动修复，需显式处理（见 D3 / R13）。

---

## A. 增量更新改造

### A.0 总原则（一句话）

> **`render()` 必须是幂等的；动效由「状态差分」驱动，不由「render() 被调用」驱动。**

`render()` 目前被 10+ 处调用（click 处理器、`action()`、`schedule()` 的 bot 回调、`#clear`、初始化）。若把动画挂在 `render()` 里无条件播放，连点"提示"就会疯狂重播动画。所有动效必须由一个 **上一帧快照 `prev`** 与当前 `game` 做差分后触发。

### A.1 render() 的函数级拆解

现状：一个 12 行的 `render()`（app.js:9–15）包办一切。改造后拆为编排函数 + 分区更新函数，**调用顺序与现状保持一致**（尤其 `selection()` 仍在最后、`schedule()` 仍在末尾）：

```js
// ---- 渲染层私有状态（与游戏状态分离，不进 engine.js）----
const handEls = new Map();      // card.id -> HTMLButtonElement
const seatEls = [];             // 4 × {name, count, act}
let prev = { topSig:null, activeSeats:'', lastSig:[null,null,null,null], round:-1, level:-1 };
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
let fxSeq = 0;                  // 特效层生成号，用于并发清理

function render(){
  renderStatus();      // #ours/#theirs/#round/#level/#wildlabel  → textContent，幂等
  renderSeats();       // 4×.seat  → 首次建 3 子节点，之后只改 textContent + class
  renderTable();       // #table-message + #table-cards → 签名守卫 + 入场/离场动画
  renderHand();        // #hand    → Map<id,el> 增删差集 + cursor 顺序校正
  renderControls();    // #play/#pass/#suggest/#next 的 disabled/hidden
  renderSummary();     // #summary
  renderHistory();     // #history → 保持全量重建（见 A.7）
  selection();         // 不变（内部含 #interpretation + #play 禁用 + hint）
  schedule();          // 不变
}
```

> `renderStatus / renderControls / renderSummary / renderHistory` 只是把现有行搬过去，**逻辑一字不改**，纯粹为可读性拆分。真正的改造集中在 `renderSeats` 与 `renderHand`，以及 `renderTable` 的动画分支。

### A.2 手牌区 `#hand`（**必改，最高价值**）

现状 `app.js:12`：读 `scrollLeft` → `replaceChildren()` → 重建 27 个 `<button>` → 恢复 `scrollLeft`。

**改造：id-keyed 差集 + cursor 顺序校正。**

```js
function makeCard(c){ /* 现有 12 行建节点逻辑原样搬入，含 onclick */ }
function updateCard(el,c){
  el.setAttribute('aria-pressed', String(selected.has(c.id)));          // 无条件（R3）
  if (el.dataset.lv !== String(game.level)) {                            // 级牌徽标随 level 变
    el.dataset.lv = String(game.level);
    refreshBadge(el, c);                                                 // badge 文案/有无
    el.setAttribute('aria-label', cardText(c)+(GD.wild(c,game.level)?'，逢人配':''));
  }
}

function renderHand(){
  const hand = $('#hand');
  const epochChanged = prev.round !== game.round;      // 跨副守卫（R6）
  if (epochChanged){ hand.replaceChildren(); handEls.clear(); }

  const keep = new Set();
  const desired = game.hands[0];

  // 1) 建 / 取
  for (const c of desired){
    keep.add(c.id);
    let el = handEls.get(c.id);
    if (!el){ el = makeCard(c); handEls.set(c.id, el); }
    else updateCard(el, c);
  }
  // 2) 删（立即移出 flex 流，不留离场节点 —— 见 R2/R1）
  for (const [id, el] of handEls){
    if (!keep.has(id)){
      if (el.contains(document.activeElement) || el === document.activeElement) moveFocus(el); // R13
      el.remove(); handEls.delete(id);
    }
  }
  // 3) 顺序校正（cursor 法，只在必要时移动，节点身份全程保留）
  let cursor = hand.firstChild;
  for (const c of desired){
    const el = handEls.get(c.id);
    if (el === cursor){ cursor = cursor.nextSibling; continue; }
    hand.insertBefore(el, cursor);      // 已在别处 → 移动（节点身份保留，可承载 FLIP）
  }
  $('#hand-title').textContent = `你的手牌 · ${desired.length} 张`;
  if (epochChanged) prev.round = game.round;
}
```

**要点**

- **删除用 `Map` 反向差集**：`for (const [id,el] of handEls) if(!keep.has(id))`。
- **顺序校正不可省**：`GD.giveBack` 内部会 `sort(g.hands[req.to], g.level)`，**还贡阶段座位 0 的手牌顺序会变**（R7）。只做增删而不校序会出错。
- **滚动位置**：移除 `hand.scrollLeft` 的读—写回。增量更新下浏览器自动维护 `scrollLeft`；内容变窄时浏览器自动 clamp，与旧行为等价（旧代码同样被 clamp）。**但原有那两行读回不要保留**，否则会把"用户已在别处滚动"的状态写回成旧值。
- **不再需要 `hand.replaceChildren()`**，因此 `.card` 的 `transition` 终于能附着在**同一个节点**上 —— 这是选牌抬升能工作的前提。

### A.3 座位区 4 × `.seat`（**必改，最低成本最高收益**）

现状 `app.js:9`：`el.replaceChildren()` 后重建 `strong/span/em`。改造后这三个子节点**只建一次**：

```js
function renderSeats(){
  for (let i=0;i<4;i++){
    const el = $('#seat'+i);
    if (!seatEls[i]){                       // 首次：建一次，之后永不重建
      const n=document.createElement('strong'), c=document.createElement('span'), em=document.createElement('em');
      el.replaceChildren(n,c,em);
      seatEls[i] = {n,c,em};
    }
    const s = seatEls[i];
    const place = game.finished.indexOf(i), last = game.last[i];
    s.n.textContent  = names[i] + (i===2?' · 队友':'');
    s.c.textContent  = place>=0
      ? (game.result?.double && place>1 ? '双下' : ['头游','二游','三游','末游'][place])
      : `余 ${game.hands[i].length} 张`;
    s.em.textContent = last ? (last.pass?'不要':last.p.type) : (i%2===0?'青松队':'暖阳队');
    el.classList.toggle('active',
      game.phase==='play' && game.turn===i ||
      game.phase==='return' && game.returns.some(r=>r.from===i));
  }
}
```

> 三个 `textContent` 赋值与原有分支**逐字符一致**，只是不再重建节点。`.seat.active` 的 `classList.toggle` 保持原样 —— 它本来就作用在持久节点上（F2），**这一行动画零改动即可工作**。

### A.4 桌面出牌区 `#table-cards`（**改「签名守卫 + 离场队列」，不做 keyed diff**）

现状 `app.js:11`：`$('#table-cards').replaceChildren()` 后重建 ≤8 个 `.tiny`。

判断：桌面内容在**每一次出牌时语义上就是全新的**（新的一次出牌），keyed diff 无意义。真正需要的是两件事：

1. **签名守卫** —— 避免无关 render 重播动画；
2. **离场队列** —— 清场时让旧牌淡出，而不是瞬间消失。

```js
const topSig = g => g.top ? `${g.top.seat}|${g.top.p.key}|${g.top.cards.map(c=>c.id).join(',')}` : '';

function renderTable(){
  const sig = topSig(game);
  const box = $('#table-cards');
  // 清场：旧组进离场队列（过牌淡出）
  for (const old of box.querySelectorAll('.group:not(.leaving)')) fadeOutGroup(old);
  if (sig && sig !== prev.topSig){
    const g = document.createElement('div');
    g.className = 'group'; g.dataset.seat = game.top.seat;
    game.top.cards.forEach((c,i)=>{
      const el = document.createElement('span');
      el.className = 'tiny' + (['♥','♦'].includes(c.s)||c.r===17?' red':'');
      el.textContent = cardText(c);
      el.style.setProperty('--i', Math.min(i,5));      // 错峰上限 5（见 B1）
      g.append(el);
    });
    box.append(g);                                     // 入场动画由 CSS 自动播放
  }
  prev.topSig = sig;
  $('#table-message').textContent = /* 原样不变的 4 分支 */;
}
```

- **`--i` 上限 5** 保证错峰延迟 ≤ 50ms，总时长不超预算。
- 压牌时（旧组→新组）旧组**不做淡出等待**，直接进队列并在下一帧移除，新牌立即飞入 —— 否则 200+220=420ms 会拖慢节奏。仅 **`game.top` 变 null（一轮打完重新领出 / 新的一副）** 时才走"淡出后才移除"的完整路径。
- `fadeOutGroup` 必须带 **生成号 + 兜底定时器**（R9）。

### A.5 `#history`（**不改，保持全量重建**）

18 个 `<div>`，内容几乎是纯追加，重建成本可忽略，且 `#history` 有 `height:120px;overflow:auto`，重建会把 `scrollTop` 归零 —— 而列表是 `slice(-18).reverse()`（最新在最上），**scrollTop=0 恰好等于"显示最新"**，是期望行为。改为 diff 反而可能引入滚动位置回归。**结论：不动。**

已知问题（本轮不修，仅记录）：若用户向下滚动查看旧记录，任何 `render()` 都会把滚动位置弹回顶部。

### A.6 `#interpretation`（**不改，仅记录**）

`selection()` 每次 `replaceChildren()` 重建 `<select>` 并用 `box.value=old` 恢复选中。已有 `if(opts.some(p=>p.key===old))box.value=old;` 守卫，功能正确。风险：下拉展开期间被重建会关闭面板。属既有行为，本轮不在范围内。

### A.7 改造价值矩阵（避免过度工程）

| 区域 | 现状 | 是否改 | 理由 |
|---|---|---|---|
| `#hand` | `replaceChildren` + 27 重建 | **✅ 必改** | 唯一承载 `aria-pressed` transition 与后续 FLIP 的区域；重建让动效无从附着 |
| 4 × `.seat` | 子节点全量重建 | **✅ 必改（极简）** | 元素本身已持久，只需"建一次 + 改 textContent"；成本 ~10 行 |
| `#table-cards` | 全量重建 | **⚠️ 半改** | 只加签名守卫 + 离场队列，**不引入 keyed diff** |
| `#table-message` | `textContent` | ❌ 不改 | 本身就是幂等文本赋值 |
| `#summary` | `textContent` | ❌ 不改 | 同上 |
| `#hint` | `textContent` | ❌ 不改 | 同上，且是 aria-live 区，不该动 |
| `#history` | 全量重建 | ❌ 不改 | 18 节点；重建=回到顶部=期望行为；diff 反增风险 |
| `#interpretation` | 全量重建 | ❌ 不改 | 已有 value 恢复守卫，改动收益 < 风险 |
| 按钮 `disabled` | 直接赋值 | ❌ 不改 | 幂等 |

**一句话结论：真正的"地基"只有两处 —— 手牌的 id-keyed 复用、座子的建一次。其余保持全量重建。**

---

## B. 四个核心动效规格

### 通用约定

- 时长上限 **250ms**；单帧预算 Mac 16.7ms / iOS 33.4ms。
- 只动画 `transform` 与 `opacity`；**禁止** `width/height/margin/border-width/top/left/box-shadow`。
- 缓动统一：进入 `cubic-bezier(.22,.68,.32,1)`（先快后缓），退出 `cubic-bezier(.4,0,.7,.2)`。
- 所有动画由 `prev` 差分触发，`render()` 幂等。

### B1 出牌飞入（Play Fly-in）

| 项 | 规格 |
|---|---|
| 触发时机 | `renderTable()` 内，`sig !== prev.topSig && sig !== ''` |
| 驱动 | **CSS**（纯声明式，零 JS 测量） |
| 关键帧 | `@keyframes cardIn{from{opacity:0;transform:translate(var(--fx,0),var(--fy,0)) scale(.92)}to{opacity:1;transform:translate(0,0) scale(1)}}` |
| 每张延迟 | `animation-delay:calc(var(--i) * 10ms)`，`--i` = `min(i,5)` → **上限 50ms** |
| 时长 / 缓动 | **200ms** / `cubic-bezier(.22,.68,.32,1)` |
| 合计上限 | 200 + 50 = **250ms** ✅ |
| 落点 | `.group` 容器上，方向由 `data-seat` 决定 |

**方向向量（依 `game.top.seat`，座位方位见 `index.html`：0=south 你 / 1=east / 2=north / 3=west）**

```css
#table-cards{--fly-d:44px}
.group[data-seat="0"]{--fy: var(--fly-d)}    /* 南 → 自下而上 */
.group[data-seat="1"]{--fx: 64px}            /* 东 → 自右向左 */
.group[data-seat="2"]{--fy: calc(-1 * var(--fly-d))}  /* 北 → 自上而下 */
.group[data-seat="3"]{--fx: -64px}           /* 西 → 自左向右 */
```

> `.felt` 可用高度约 `440-128-74 ≈ 238px`，44px 位移 ≈ 18%，视觉明确但不夸张；水平方向 `.felt` 更宽，取 64px。
> `var()` 在 `@keyframes` 内按元素解析为静态值，**不需要 `@property` 注册**（未插值自定义属性本身）。

**P1 可选增强（本轮不做，仅备案）**：人类出牌（seat 0）时改用 FLIP ghost —— 出牌前 `getBoundingClientRect()` 取手牌位置 → 原节点立即移除 → 在 `#fx-layer`（`position:fixed;inset:0;pointer-events:none;z-index:60`）放克隆 → `transform` 飞向 `#table-cards` 矩形 → `animationend` 移除。真实源位飞入观感最好，但需处理滚动容器裁剪与 4 座位不一致（bot 无源节点）的问题。**建议 P0 先上方向性飞入，观感验收后再决定是否加。**

### B2 轮转高亮（Turn Rotation）

| 项 | 规格 |
|---|---|
| 触发时机 | `renderSeats()` 的 `classList.toggle('active',…)`（**已有调用点，一行不改**） |
| 驱动 | **纯 CSS**（伪元素 `::after` 的 `transition`） |
| 属性 | `opacity` + `transform: scale()`（**合成属性**） |
| 时长 / 缓动 | 环显隐 **180ms**；一次性脉冲 **240ms** |
| 陷阱 | **禁止在 `.seat` 本体动画 transform** —— `.seat.north/.south` 已用 `translateX(-50%)` 居中（F5） |

```css
.seat::after{                       /* 新增：合成层金色环，替代 box-shadow 动画 */
  content:''; position:absolute; inset:-4px; border-radius:19px;
  border:2px solid var(--gold);
  opacity:0; transform:scale(.94);
  transition:opacity .18s cubic-bezier(.22,.68,.32,1),
             transform .18s cubic-bezier(.22,.68,.32,1);
  pointer-events:none;
}
.seat.active::after{opacity:1; transform:scale(1)}
```

- **保留** `.seat.active{box-shadow:0 0 0 3px var(--gold),…}` 的静态观感？**建议删除该 box-shadow**，改由 `::after` 承担 —— 否则两套环叠加。若保留则 `::after` 仅做脉冲。
- **为什么不动画 `box-shadow`**：`box-shadow` 是 paint 属性，逐帧重绘，27 张牌 + 4 座位的场景下会掉帧。
- **一次性脉冲（可选）**：轮转发生时给新 active 座位加 `.just-turned`，`animation:ringPulse 240ms`，240ms 后由 JS 移除类（或 `animationend`）。仅在新旧 `activeSeats` 签名变化时才加，避免无关 render 重播。

### B3 选牌抬升（Selection Lift）

现状 `.card[aria-pressed=true]{transform:translateY(-15px);background:#fff0bf;border:2px solid #b48735}`，`transition:transform .12s`。

| 项 | 规格 |
|---|---|
| 触发时机 | 无需 JS —— `aria-pressed` 由 `.card` 的 `onclick` 与 `updateCard()` 维护（**现有逻辑保留**） |
| 驱动 | **纯 CSS transition** |
| 位移 | **`translateY(-15px)` 原样保留**（用户明确要求） |
| 时长 / 缓动 | 抬起 **180ms** `cubic-bezier(.2,.85,.3,1)`；落下 **140ms** `ease-in` |
| 前提 | **依赖 A.2 手牌节点复用** —— 全量重建下 transition 不会触发（这正是当前"没有动画"的直接体现） |

```css
.card{ /* 原 transition:transform .12s 替换为 */
  transition:transform .18s cubic-bezier(.2,.85,.3,1);
}
.card[aria-pressed="false"]{ transition:transform .14s ease-in }
.card[aria-pressed="true"]{
  transform:translateY(-15px);
  background:#fff0bf;
  box-shadow:0 3px 0 #dfd0ad, inset 0 0 0 2px #b48735;   /* ← 见下 */
  z-index:2;                                              /* ← 见下 */
}
```

**两处需确认的等价替换（视觉一致，消除布局抖动）**

1. `border:1px` → `border:2px` 是 **`border-width` 变化，会触发布局重排**，且 1px 的内容盒收缩会造成选中瞬间的微跳 —— 违反 C 节的"只动合成属性"。改用 `box-shadow: … inset 0 0 0 2px #b48735` 后**视觉像素级一致，但不触发 layout**。若坚持保留 `border`，需接受每次选牌一次重排。
2. `z-index:2` —— 手牌是 `margin-right:-25px` 重叠布局，兄弟元素后者在上，**抬起的那张会被右侧邻居压住**。`.card` 已有 `position:relative`，加 `z-index` 即可修正。属纯视觉增强，无功能风险。

### B4 过牌淡出（Pass Fade-out）

有两条候选语义，本轮 **P0 只做 (a)**：

**(a) 桌面清场淡出 —— P0 采纳**

| 项 | 规格 |
|---|---|
| 触发时机 | `renderTable()`：`prev.topSig !== '' && topSig === ''`（三家都不要 → `game.top=null` → 重新领出；或 `GD.deal` 新的一副） |
| 驱动 | CSS 动画 + JS 回收 |
| 关键帧 | `@keyframes cardOut{from{opacity:1;transform:translate(0,0) scale(1)}to{opacity:0;transform:translate(0,8px) scale(.96)}}` |
| 时长 / 缓动 | **200ms** / `cubic-bezier(.4,0,.7,.2)` |
| 回收 | `animationend` 移除；**必须有兜底**（R9） |

**(b) 座位「不要」气泡 —— 列为可选，本轮建议不做**

座位 `em` **已经在持久显示"不要"文本**（`app.js:9`：`last.pass?'不要':last.p.type`），信息不依赖动效。再叠一个淡出气泡是纯装饰，且会与 750ms 节奏竞争。**结论：不做。** 若后续 art-director 要求，规格为：`.ghost` 绝对定位于座位、`animation:passFade 520ms`（in 120 / hold 180 / out 220），520ms < 750ms 不重叠。

### B5 时序：在 750ms bot 节奏中的位置

```
t=0     玩家点击 → action() → selected.clear() → render()
        ├─ 手牌节点移除（0ms，瞬时）
        └─ 出牌飞入 0 → 250ms
t=0     render() 末尾 schedule() → setTimeout 750ms
t=750   GD.bot(game,seat) → render()
        ├─ seat 1/2/3 出牌 → 飞入 750 → 1000ms
        └─ 若过牌且清场 → 桌面淡出 750 → 950ms
t=1500  下一家 … （动画区间互不重叠 ✅）
```

- 连续 3 家 bot：750 / 1500 / 2250ms，动画 250ms，**无重叠**。
- 清场淡出（200ms）后紧接着新领出的飞入（250ms）：清场发生在第 3 家过牌的 render 里，新领出在下一个 750ms 之后，**天然串行**，不叠加。
- **节奏建议（可选）**：若实测 750ms 等待 + 250ms 动画显得拖沓，优先把 `BOT_DELAY` 从 750 降到 **700ms**（700+200=900ms 感知 ≈ 原节奏但更连贯），而不是压缩动画时长到 150ms 以下（低于 150ms 会丢失"飞入"的方向感知）。

---

## C. 性能约束

### C.1 硬规则

| 规则 | 说明 |
|---|---|
| ✅ 只动画 `transform` / `opacity` | 二者由合成器处理，不触发 layout / paint |
| ❌ 禁 `width/height/margin/padding/top/left` | 触发 layout |
| ❌ 禁 `border-width`（含 B3 的 2px 变更） | 触发 layout |
| ❌ 禁动画 `box-shadow` / `background` / `filter` | 触发 paint（逐帧重绘） |
| ⚠️ `background-color` / `box-shadow` 的 **transition** | 仅在**单个**元素上可接受（B3 选牌），**不得**用于 8+ 张牌的批量动画 |

### C.2 `will-change` 策略（27 张规模）

**结论：不设常驻 `will-change`；按需添加、用完即回收。**

- 常驻 27 层 ≈ 58×86×4B × 27 ≈ **540KB** 显存看似不大，但 iOS Safari 的层还有**最小尺寸对齐与 tiling 开销**，且合成器层的管理成本随数量非线性上升；更关键的是 `.hand` 是 `overflow-x:auto` 滚动容器，**在滚动容器内常驻提升子元素**会显著增加滚动合成成本。
- **做法**：只在动画期间给**真正在动的元素**加 `.fx{will-change:transform,opacity}`，由 `animationend` / `transitionend` 移除；**并发上限 8 个**（一次出牌 ≤8 张 + 少量特效）。
- 不要同时写 `will-change` 和 `translateZ(0)` —— 二者等价，叠加无收益。
- 桌面牌组 `.group` 动画时给**容器**加一次 `will-change` 即可，不必给每张 `.tiny` 加。

```js
function fx(el){ el.classList.add('fx'); el.addEventListener('animationend',()=>el.classList.remove('fx'),{once:true}); }
```

### C.3 帧预算

| 目标 | 单帧预算 | 说明 |
|---|---|---|
| macOS Safari/Chrome | 16.7ms（60fps） | 出牌峰值：8 张 `.tiny` 同时 transform → 远低于预算 |
| iOS Safari | 33.4ms（30fps） | 保守目标；iOS 合成器线程与主线程分离，transform/opacity 动画即使主线程忙也能保持 |

**验收手段**：Chrome DevTools → Performance 录制一次完整 bot 回合，确认 **Frames 轨道无掉帧**、**Layout/Paint 计数为 0**（只有 Composite）。

### C.4 其他

- `.hand{isolation:isolate}` 已存在，新增 `z-index` 不会逃逸到页面层叠上下文。
- 建议给 `#table-cards` 加 `contain:layout paint`（可选，限制重排范围）。
- 不使用 `requestAnimationFrame` —— 全部由 CSS 动画/过渡驱动，天然与刷新率对齐，无 JS 每帧开销。

---

## D. 无障碍

### D.1 补全 `prefers-reduced-motion`（覆盖 animation）

**替换**现有 `@media(prefers-reduced-motion:reduce){*{transition:none!important}}` 为：

```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.01ms !important;
    animation-iteration-count:1 !important;
    transition-duration:.01ms !important;
    scroll-behavior:auto !important;
  }
}
```

> **关键：用 `.01ms` 而不是 `none`。** `animation:none` 会让 `animationend` **永不触发**，导致依赖该事件回收的离场节点与 fx 克隆永久泄漏（R9）。`.01ms` 既"看起来是瞬时的"，又保证事件正常派发。
> 选择器必须包含 `*::before,*::after`，否则 B2 的 `.seat::after` 环不受控。

**JS 侧双保险**（因为 CSS 无法阻止 JS 创建特效元素）：

```js
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
// 任何依赖 animationend 回收的地方：
if (REDUCED.matches) { el.remove(); return; }        // 直接移除，不进动画队列
```

`REDUCED` 是 **live** 对象，无需手动重查；若需响应运行时切换，监听 `REDUCED.addEventListener('change', …)`。

### D.2 动效不得承载唯一信息

**原则：任何由动效表达的状态，必须已有等价的文本/ARIA 表达。**

| 动效 | 表达的语义 | 已有的等价文本载体 | 是否冗余 ✅ |
|---|---|---|---|
| 出牌飞入 | 谁出了什么牌 | `#table-message`（`名字 · 牌型 · 点数`）、座位 `em`（牌型）、`#history`（逐条日志）、`#hint` | ✅ |
| 轮转高亮 | 轮到谁 | `#table-message`（`X领出 · 请选择牌型`）、`#hint`（`轮到你…` / `等待X出牌…`）、座位 `span`（余 N 张） | ✅ |
| 选牌抬升 | 哪些牌被选中 | `.card[aria-pressed]` + `aria-label`、`#hint`（`已选 N 张`） | ✅ |
| 过牌淡出 | 桌面清空 / 有人过牌 | `#table-message`、座位 `em`（`不要`）、`#history`（`X号不要`） | ✅ |

- `#hint` 已是 `role="status"` + `aria-live="polite"`；`#summary` 已是 `role="status"`。**保持不动。**
- ⚠️ **色觉无障碍**：`.seat.active` 的金色环是**颜色 + 位置**双重编码，且 `#table-message`/`#hint` 有文本冗余 —— 满足 WCAG 1.4.1（不依赖颜色单独传达信息）。
- ⚠️ **读屏频率**：`#hint` 在每次 `render()` 都会被赋值。若文本未变化应跳过赋值以免读屏重复播报：建议 `if(hintEl.textContent !== s) hintEl.textContent = s;`（**可选增强**，属既有行为，非本轮引入）。

### D.3 焦点管理（改造必须处理的既有缺陷）

出牌后手牌按钮被移除，`document.activeElement` 会掉回 `<body>`，键盘用户丢失位置。

**规格**：在 `renderHand()` 的删除分支里，若被删节点包含当前焦点，先把焦点转移到一个稳定的邻近元素：

```js
function moveFocus(el){
  const next = el.nextElementSibling || el.previousElementSibling || $('#hand') || $('#play');
  if (next.tabIndex < 0 && next !== $('#hand')) next.tabIndex = 0;
  next.focus?.({preventScroll:true});
}
```

- `preventScroll:true` 避免聚焦时把 `.hand` 横向滚动条弹到别处（会破坏"滚动位置保持"这一硬性要求）。
- 桌面 `#table-cards` 的 `.tiny` 是 `<span>`，不可聚焦，无焦点问题。

---

## E. 回归风险与自测方法

> 通用自测环境：`node tests/rules.test.cjs`（引擎回归，保证 `engine.js` 未被波及）+ 浏览器手动/Playwright 交互脚本。建议用仓库已配置的 `playwright-cli` 录制关键路径。

| # | 风险点 | 说明 | 验证方式 |
|---|---|---|---|
| **R1** | **手牌横向滚动位置** | 出牌后 `scrollWidth` 变窄，浏览器 clamp `scrollLeft`。旧代码用「读—写回」；增量下由浏览器自动维护。若误保留旧的读写回两行，会把已变化的值写回成旧值。另：若把离场节点留在 flex 流，`scrollWidth` 不缩，位置与内容错位。 | 手牌横向滚到中段 → 选中**中间**几张 → 出牌 → 断言 `hand.scrollLeft` 与「内容相对偏移」一致；对比改造前后录屏。 |
| **R2** | **`.card:last-child{margin-right:0}`** | 离场节点若留在 flex 流，`:last-child` 落到错误元素，右侧多 25px 空洞、总宽不对。 | 出牌后 `getComputedStyle(hand.lastElementChild).marginRight === '0px'`，且 `lastElementChild.dataset.id === game.hands[0].at(-1).id`。 |
| **R3** | **`selected` 集合与 `aria-pressed`** | 节点复用后，若不**无条件**重设 `aria-pressed`，会残留上一次的 `true`。 | 选中 A 牌 → 出掉别的牌 → `render()` → 断言 A 的 `aria-pressed==='true'` 且 `getComputedStyle(A).transform` 含 `-15`；`selected` 与 DOM 上 `aria-pressed=true` 的集合**逐 id 相等**。 |
| **R4** | **`#play` 禁用逻辑 + `isReturn()` 文案** | `selection()` 依赖 `#interpretation` 的 `opts`。风险不在代码改动而在**调用顺序**被无意调整。 | 覆盖 4 态：轮到你可出 / 轮到电脑 / 无合法牌型 / **还贡态**。断言：`disabled` 值 + 文案为「确认还贡」且此时 `#interpretation.hidden===true`。 |
| **R5** | **`suggestionIndex` 循环提示** | `selected=new Set(m.cards.map(...))` 后需 `render()` 把 `aria-pressed` 刷到**复用**节点上（与 R3 同源）。 | 连点「提示」10 次（超过 `ms.length` 触发取模回绕）→ 每次断言 `selected` == 高亮集合，且 `suggestionIndex` 递增不越界。 |
| **R6** | ⚠️ **跨副节点复用（最隐蔽）** | **`deck()` 每副生成完全相同的 108 个 id**（F1）。`GD.deal` 后增量更新会复用上一副的节点 → 触发错误飞入、残留 `aria-pressed`、级牌 badge 与新 `game.level` 不符。 | **必须加 round epoch 守卫**（A.2）。验证：连点 3 次「下一副」→ 断言手牌恒 27 张、`aria-pressed` 全 `false`、badge 与新 `game.level` 一致、且**新一副首次 render 不播放飞入动画**。 |
| **R7** | **贡/还贡期手牌重排** | `GD.giveBack` 内部对收牌方 `sort()`，座位 0 手牌**顺序会变**。只做增删差集不做顺序校正就会错位。 | 走完一整局到进贡阶段 → 断言 DOM 中 `.card` 的 `data-id` 序列 **===** `game.hands[0].map(c=>c.id)`（逐项比对，含还贡后插入的新牌）。 |
| **R8** | **`#history` 滚动位置** | 本轮不改，需确认"仍会弹回顶部"这一既有行为未被意外改变。 | 向下滚动 history → 触发任意 render → 断言 `scrollTop === 0`（与改造前一致）。 |
| **R9** | ⚠️ **`animationend` 依赖 + reduced-motion** | 离场节点/fx 克隆靠 `animationend` 回收。`animation:none!important` → 事件永不触发 → **节点泄漏**；`animationend` 还可能因标签页后台不派发。 | 开启「减弱动态效果」→ 连续出 20 手 → 断言 `#table-cards.children.length <= 1`、DOM 节点总数不增长（DevTools Performance monitor → DOM Nodes 曲线平稳）。**兜底 `setTimeout(remove, dur+80)` 必须实现。** |
| **R10** | **快速连点重播动画** | `render()` 被高频调用，动画若不由状态差分驱动会反复重播。 | 快速连点「提示」10 次 → 断言桌面组未新增、飞入动画未重播（用 `getAnimations()` 检查活跃动画数 ≤1 组）。 |
| **R11** | **iOS Safari 滚动容器内合成** | `.hand{overflow-x:auto}` 内动画 transform 子节点，惯性滚动期间 DOM 插入可能跳动。 | **真机 iOS Safari** 实测：滚动中点击出牌、出牌后立即滚动。风险低（变更只在点击后发生），但需真机确认。 |
| **R12** | **`#interpretation` 下拉被重建** | 既有行为（A.6），本轮不改，仅确认未恶化。 | 展开下拉 → 触发 render → 记录是否被关闭（与改造前一致即可）。 |
| **R13** | **焦点丢失** | 出牌后 `.card` 被移除，焦点掉到 `body`（F7）。 | 键盘 Tab 到某张手牌 → 空格/回车出牌 → 断言 `document.activeElement !== document.body`，且焦点落在预期邻近元素；断言 `.hand` 的 `scrollLeft` 未因聚焦而跳变。 |
| **R14** | **12 行 render() 的 phase 分支** | `play / return / over` 三态 + 贡牌/抗贡，任一分支文本被改动即回归。 | 覆盖：`play` / `return`（含抗贡：`g.hands` 中两张大王 → 直接 `phase='play'`）/ `over`（含双下、过 A、三次冲 A 退回 2）→ 逐态断言 `#table-message`、`#summary`、`#round`、座位 `span` 文案与改造前**逐字符相同**（建议改造前先录一份快照）。 |

### 建议的改造前置动作

**在动手前先对改造前的 12 行 render 输出做一次文本快照**（遍历上述 14 个场景，dump `#table-message`/`#summary`/`#round`/4 个座位的 textContent 到 JSON），改造后 diff —— 这是 R14 最省力的保障。

---

## F. 验收清单（逐条勾选）

### 结构（A）
- [ ] 1. `render()` 已拆为 `renderStatus/renderSeats/renderTable/renderHand/renderControls/renderSummary/renderHistory`，且 `selection()` 与 `schedule()` 仍在末尾按序调用。
- [ ] 2. `renderHand()` 使用 `Map<id, element>` 差集；出 5 张牌后 `handEls.size === game.hands[0].length`。
- [ ] 3. DOM 中 `.card` 的 `data-id` 序列 === `game.hands[0].map(c=>c.id)`（**含还贡后**，覆盖 R7）。
- [ ] 4. 不存在「离场节点留在 flex 流」的情况：`hand.lastElementChild` 的 `marginRight === '0px'`（R2）。
- [ ] 5. 存在 round epoch 守卫：切换新一副时手牌区整体重建，`aria-pressed` 全 `false`（R6）。
- [ ] 6. 座位 3 个子节点**只创建一次**，后续 render 仅改 `textContent`（可用 MutationObserver 断言 `childList` 变更数为 0）。
- [ ] 7. `#history` / `#interpretation` / `#hint` / `#summary` **未被改动**（git diff 无这些标识符的行为变更）。

### 动效（B）
- [ ] 8. 出牌飞入：4 个座位方向各自正确（南自下 / 东自右 / 北自上 / 西自左），时长 ≤250ms。
- [ ] 9. 出牌飞入错峰：`--i` 上限 5，最大延迟 ≤50ms；8 张牌时最后一张仍在 250ms 内完成。
- [ ] 10. 轮转高亮：`.seat.active` 切换时 `::after` 环 180ms 过渡；`.seat` 本体的 `transform:translateX(-50%)` **未被破坏**（南/北座位仍居中，R-F5）。
- [ ] 11. 选牌抬升：`translateY(-15px)` **数值未变**；抬起 180ms / 落下 140ms；抬起的那张**在其右侧邻居之上**（`z-index` 生效）。
- [ ] 12. 过牌淡出：三家都不要 → `game.top=null` → 旧组 200ms 淡出后被移除，`#table-cards` 最终为空。
- [ ] 13. 所有动效**由状态差分触发**：连点「提示」10 次、连点「取消选择」10 次，桌面/手牌**不重播**入场动画（`getAnimations().length` 不增长）。
- [ ] 14. 单次 bot 回合（750ms）内动画区间不重叠，实测 `750 + 250 ≤ 1000ms`。

### 性能（C）
- [ ] 15. DevTools Performance 录制一个 bot 回合：**Layout 计数 0、Paint 计数 0**，仅 Composite。
- [ ] 16. 全项目 `grep` 结果：动画相关 CSS 中**不出现** `width/height/margin/padding/top/left/border-width/box-shadow/background` 的 `transition` 或 `@keyframes` 变更。
- [ ] 17. `will-change` **无常驻**：静态检查无 `will-change` 出现在基础选择器上；运行时并发带 `.fx` 的元素 ≤8。
- [ ] 18. `.fx` 在 `animationend` 后被移除（连续出 20 手后带 `.fx` 的元素数回到 0）。
- [ ] 19. macOS Chrome/Safari 60fps、iOS Safari ≥30fps（Frames 轨道无长帧）。

### 无障碍（D）
- [ ] 20. `prefers-reduced-motion` 媒体查询同时覆盖 `animation-duration` 与 `transition-duration`，且选择器含 `*::after`。
- [ ] 21. 开启「减弱动态效果」后：所有状态仍**瞬时正确**呈现（无内容缺失），且**无节点泄漏**（DOM 节点计数平稳，R9）。
- [ ] 22. 逐个关闭全部 4 个动效后，游戏**信息完整度不变**（`#hint` / `#table-message` / `#summary` / 座位 `em` 文本齐全）。
- [ ] 23. 键盘出牌后 `document.activeElement !== document.body`，且 `.hand.scrollLeft` 未跳变（R13）。
- [ ] 24. `#hint`（`aria-live`）与 `#summary`（`role=status`）的 ARIA 属性**未被改动**。

### 行为保持（E）
- [ ] 25. `node tests/rules.test.cjs` 全绿（`engine.js` 零改动）。
- [ ] 26. 14 个场景的文本快照与改造前**逐字符一致**（R14）。
- [ ] 27. `#play` 禁用逻辑 4 态全部正确，含 `isReturn()` 时文案为「确认还贡」且 `#interpretation` 隐藏（R4）。
- [ ] 28. 手牌横向滚动位置在「出牌 / 选牌 / 还贡」后均保持（R1）。
- [ ] 29. `restart` 重开局、`GD.deal` 下一副、贡牌 / 还贡 / **抗贡**（双大王）三条流程均走通。
- [ ] 30. `git diff --stat` 仅涉及 `index.html` 与 `app.js`；`engine.js`、`room.js`、`server.cjs` 无改动。

---

## 附：关键决策摘要（ADR-lite）

| # | 决策 | 备选 | 选择理由 |
|---|---|---|---|
| 1 | 手牌用 `Map<id,el>` 差集 | 虚拟 DOM / 全量重建 + FLIP | 无框架无构建，65 节点规模引入 VDOM 属过度工程；全量重建无法承载 transition |
| 2 | 桌面区**不做** keyed diff，只做签名守卫 + 离场队列 | 完整 keyed diff | 每次出牌语义上就是全新内容，keyed diff 无收益 |
| 3 | `#history` / `#interpretation` 保持全量重建 | 一并 diff | 18 节点；重建=回到顶部=期望行为；diff 反增滚动回归风险 |
| 4 | 出牌飞入用**方向性 CSS 动画** | FLIP ghost 真实源位飞入 | 4 座位一致、零测量、零布局风险；FLIP 对 bot 无源节点，列为 P1 |
| 5 | 轮转高亮挂 `::after` | 动画 `.seat` 的 `box-shadow` | `.seat` 本体 transform 已被 `translateX(-50%)` 占用；`box-shadow` 触发 paint |
| 6 | reduced-motion 用 `.01ms` | `animation:none` | `none` 导致 `animationend` 不触发 → 节点泄漏 |
| 7 | 手牌离场**不留**在 flex 流 | 留节点做退出动画 | `:last-child` 负边距与 `scrollWidth` 会错乱；飞入动画已提供视觉连续性 |

---

## 待确认 / 需上游输入

1. **给 art-director（林绘澄）**：B3 中 `border:2px` → `inset box-shadow` 的等价替换（视觉像素级一致、消除重排），请确认是否接受；以及 B2 是否保留 `.seat.active` 的静态 `box-shadow` 还是完全交给 `::after`。
2. **给主理人**：B5 的 `BOT_DELAY` 是否从 750ms 调整为 700ms（可选，非阻塞）。
3. **给严守真（QA）**：E 节的「改造前文本快照」建议在动手前采集，作为 R14 的基线。
4. **知识缺口**：本方案未使用任何需联网校验的浏览器新 API；`var()` 在 `@keyframes` 内的解析、`contain:layout paint` 在 iOS Safari 15+ 的支持度建议在真机冒烟时确认一次。
