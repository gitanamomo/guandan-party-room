# Phase 6 打磨轮次 · 质量门禁报告 / QA Gate Report

> ## 🔄 复验状态（P6-QA-02 · 2026-09-10 · 严守真）
>
> **本文档的历史判定（🟡 CONCERNS）保留为审计痕迹，不抹改。**
>
> **复验后最终门禁判定：🟡 CONCERNS（可结项）**
>
> - **K1（Major）** ✅ **已修复并验证通过** —— 角标语义错误 **35 → 0**，不变量违例 0，10 态全覆盖
> - **K2（Minor）** ✅ **已修复并验证通过** —— 圆角裁切 **13px → 0px**
> - **K3（Minor）** ⚠️ **部分修复** —— 主场景（本副结束）已正确落到 `#next`；但**兜底链残留缺陷**：人类走完头游而本副未结束时，焦点仍会落到随后被禁用的 `#play`（详见 `qa-recheck.md` §5 K3-R）
> - **无新增回归**：133 项断言，4 项失败全部集中在上述 K3 残留
>
> **最终结论：可结项。** 剩余 1 项跟进（K3-R，Major 非阻塞，1 行修复，建议负责人 engineering-lead）。
> 完整复验报告见 → [`qa-recheck.md`](./qa-recheck.md)

| 项 | 值 |
|---|---|
| Task ID | P6-QA-01 |
| 角色 | 严守真 · quality-lead |
| 被测改动 | P6-ENG-02（`index.html` + `app.js`） |
| 判据来源 | `overlay-spec.md` §6（31 条）/ `motion-spec.md` §F（30 条）/ `polish-plan.md` §4（R1–R5） |
| 方法 | 静态分析 + **独立自建 jsdom 环境**（`/tmp/qa-yanshouzhen`，未复用 `/tmp/domtest` 任何环境或结论）+ 与改造前快照的差分比对 |
| 日期 | 2026-09-09 |
| 复验 | 2026-09-10 · P6-QA-02 · 见 `qa-recheck.md` |

---

## 1. 门禁判定（历史记录 · 2026-09-09）

# 🟡 CONCERNS

**一句话理由**：5 条红线项全部实测通过、180 项自动化断言零失败、改动严格限定在 `index.html` 与 `app.js`；但工程侧上报的 `.turn-chip` 语义缺陷经独立复现为**真实存在且在真实对局中高频出现**（404 个渲染场景中 35 次、其中轮到"你"9 次），属新增无障碍功能的语义错误，虽不阻塞任何游戏路径，但不应带病结项。

- **可结项**：是（不阻塞玩法、不阻塞发布流程）
- **必须带走**：1 项 Major（K1）+ 2 项 Minor（K2 / K3）
- **不得放行条件**：无（未发现 Blocker / Critical）

---

## 2. 测试执行总览

| 套件 | 环境 | 断言数 | 通过 | 失败 |
|---|---|---|---|---|
| 静态分析（CSS/HTML/JS 结构与对比度计算） | Node 22.22.2 | 68 | 68 | 0 |
| 运行时套件（jsdom 24，独立安装） | jsdom + 自体 harness | 68 | 68 | 0 |
| 专项补充（fx 生命周期 / 滚动 / 抗贡 / 全场 E2E） | jsdom | 21 | 21 | 0 |
| 引擎回归 `node tests/rules.test.cjs` | Node | 23 | 23 | 0 |
| **合计** | | **180** | **180** | **0** |

> 独立性声明：未使用 `/tmp/domtest`；依赖仅 `jsdom@24`，安装于 `/tmp/qa-yanshouzhen/node_modules`；项目 `package.json` 与 `node_modules` 未改动（mtime 2026-09-09 20:25 < 快照 20:49）。
> 差异基线：`.workbuddy/snapshots/2026-09-09-pre-polish/` 的 `index.html` + `app.js` 被复制到 `/tmp/qa-yanshouzhen/pre/`，与现网版本用**同一随机种子**（mulberry32(42)）并行驱动，逐场景比对渲染输出。

---

## 3. 五条红线项实测结果

### 红线 1 · R1 round epoch 守卫（最高优先级）— ✅ 通过

连续 5 副发牌（level 依次 2→5→9→14→3→7），每副后逐项断言：

| 断言 | 实测数据 | 结论 |
|---|---|---|
| 每副手牌张数 | `[27,27,27,27,27]` | ✅ |
| 跨副 DOM 节点复用数 | `[0,0,0,0,0]`（新副元素零"上一副标记"） | ✅ |
| `handEls.size === game.hands[0].length` | `[27,27,27,27,27]` | ✅ |
| DOM 顺序 === `game.hands[0]` 顺序 | 5/5 全等 | ✅ |
| 残留 `aria-pressed="true"` 数 | `[0,0,0,0,0]` | ✅ |
| 级牌 badge 与当前 level 错配数 | level 5/9/14/3/7 下均 `0`（含"逢人配 / 级牌"文案） | ✅ |
| 新副错误飞入（桌面遗留非离场牌组） | `[0,0,0,0,0]` | ✅ |
| `round` 单调递增 | `[2,3,4,5,6]` | ✅ |

**附加**：另测「同副内 level 变化不重新发牌」的 `updateCard` 分支 —— level 改为 11 后 badge 增删与 `逢人配` aria-label 同步更新，错配 0。即 R1 的两条分支（epoch 重建 / 原地更新）均已覆盖。

### 红线 2 · 行为保持 — ✅ 通过

| 断言 | 实测 | 结论 |
|---|---|---|
| `selected` 集合与 `aria-pressed` 逐 id 同步 | 12 次交互，不同步 0 次 | ✅ |
| 复用节点上被选中的牌，出掉**别的**牌后仍 `aria-pressed=true` | `true` | ✅ |
| `#play` 态1 轮到你领出 | `disabled=false` / 文案「出牌」 | ✅ |
| `#play` 态2 轮到电脑 | `disabled=true` | ✅ |
| `#play` 态3 轮到你但压不过（桌上四王炸） | `disabled=true` 且 `#pass` 可用 | ✅ |
| `#play` 态4 还贡 | 文案「确认还贡」且 `#interpretation.hidden=true` | ✅ |
| 还贡态 0 张 / 1 张的禁用边界 | 0 张禁用、1 张可用 | ✅ |
| `suggestionIndex` 回绕 | 连点 76 次（候选 71）→ index=91，同步始终成立 | ✅ |
| restart 重开局 | 27 张、全部新建节点、`round=1`、`level=2`、`selected` 清空、弹窗关闭 | ✅ |
| 手牌横向 `scrollLeft` 保持 | 选牌/出牌/还贡/下一副后分别保持 137/137/60/88 | ✅（注：见 §6-9） |
| DOM 顺序 === `game.hands[0]` | 初始、进贡后、还贡后（含 `GD.giveBack` 内部 `sort` 校正）、出 6 张后 全等 | ✅ |
| 出 5+ 张后 `handEls.size` | 出 6 张 → map=21 / hand=21 | ✅ |
| `.card:last-child` 负边距未错位（R2） | `lastElementChild.dataset.id === hands[0].at(-1).id` 且匹配 `:last-child` | ✅ |
| 抗贡（末游双大王） | `phase` 直接回 `play`、头游领出、`returns` 无残留 | ✅ |
| 全场 E2E（四电脑跑到过 A） | 8 副无异常，`champion=0`，DOM 节点 126（有界） | ✅ |

### 红线 3 · 无障碍 — ✅ 通过（一项见 §6-7 的判定边界）

| 断言 | 实测 | 结论 |
|---|---|---|
| `prefers-reduced-motion` 用 `.01ms` 而非 `none` | 静态确认 `animation-duration:.01ms!important`，全项目 0 处 `animation:none!important` | ✅ |
| 选择器含 `*::before,*::after` | 确认 | ✅ |
| 含 `animation-iteration-count:1` | 确认 | ✅ |
| JS 双保险（`fadeOut` / `fxEls` 直接 return） | 静态 + 运行时：reduced 下 20 轮后残留 0、30 轮后 DOM 节点 163→163、`.fx` 恒 0 | ✅ |
| 离场节点立即回收、不泄漏 | reduced：`#table-cards .group` 残留 0；非 reduced：400ms 后残留 0（280ms 兜底生效） | ✅ |
| 焦点出牌后不掉到 `<body>` | 聚焦第 0 / 3 / 末张选中牌分别出牌，焦点均落到 `#hand` 内邻近 `.card` | ✅ |
| `.fx` 由 `animationend` 回收 | 派发 `animationend` 后 `.fx` 归零 | ✅ |
| `.fx` 并发上限 8 | 10 张牌时 `.tiny=10` 而 `.fx=8` | ✅ |
| `#hint` / `#summary` ARIA 属性未变 | `role=status` + `aria-live=polite` 均在 | ✅ |
| 无脉冲/无限动画 | 0 处 `infinite` | ✅ |

### 红线 4 · 回归 — ✅ 通过

| 断言 | 实测 | 结论 |
|---|---|---|
| `node tests/rules.test.cjs` | **23 tests passed** | ✅ |
| `engine.js` 未改动 | `diff` 与快照 **IDENTICAL** | ✅ |
| `room.html` 未改动 | `diff` **IDENTICAL** | ✅ |
| `room.js` 未改动 | `diff` **IDENTICAL** | ✅ |
| `server.cjs` 未改动 | 不在快照内；mtime **2026-09-09 19:54:11**，早于快照(20:49)与打磨(21:2x) | ✅ |
| 逐字符文本快照（R14 / motion §F-26） | **404 个场景 × 24 个渲染字段**全部一致；座位 strong/span/em/class × 4 座 × 404 场景全部一致 | ✅ |

> 文本快照覆盖：phase `play / over / return`、副数 `1,2,3,4,5`（含跨副）、还贡态 8 个场景。
> **唯一差异**：`tableCards` 原始文本有 71/404 处不同 —— 已逐条归因，100% 为"清桌瞬间旧牌组处于 200ms 淡出中"（`groupsLeaving>=1` 且该刻 `game.top===null`），属**过牌淡出动效这一有意新增**；排除离场组后的**稳定态文本 404/404 完全一致**。非缺陷。

### 红线 5 · 越界检查 — ✅ 通过

- `index.html` 与 `app.js` 之外，**无任何文件 mtime 晚于快照时间 2026-09-09 20:49**。
- `package.json` mtime 20:25:42 < 20:49，未改动。
- 无 git 仓库，故以「快照 `diff` + 全目录 mtime 扫描」替代 `git diff --stat`（motion §F-30 的等效替代）。

---

## 4. 判据逐条覆盖

### 4.1 `overlay-spec.md` §6（31 条）

| ID | 判据 | 判定 | 依据 |
|---|---|---|---|
| A1 | 1536×1024 原图未改 | ✅ | PNG IHDR 实测 1536×1024，2.47MB，mtime 09-07 19:59（早于快照），无重编码 |
| A2 | `.felt` 实心椭圆已删 | ✅ | 独立 `.felt` 规则 **0 处**；仅 `.felt-played` 2 处；`watermark` 0 处 |
| A3 | 四角色面部未被 UI 覆盖 | ⛔ 无法判定 | 需截图比对，本轮禁止视觉校验 |
| A4 | 木环/虚线圈未被假边框覆盖 | ⛔ 无法判定 | 同上 |
| B1 | ≥951 四角四卡 | ✅ | north `top:14px;left:16px` / east 右上 / west `bottom:80px;left:16px` / south 右下 逐条匹配 |
| B2 | `.table-message` 顶部条幅 v 2–6% | ✅ | `left:50%;top:3%;transform:translateX(-50%);max-width:60%` |
| B3 | `.room-label` 左下 | ✅ | `left:16px;bottom:14px`，与 west(`bottom:80px`) 不重叠 |
| B4 | 出牌堆居中于桌面圈内 | ✅ | `.table-cards` flex 居中 + `flex-wrap` + `max-width:100%`；`.felt-played` 落 h30–70% / v46–70% |
| B5 | ≤560 顶部四卡条 | ✅ | west/north/east/south 均 `top:8px` 四等分；`.room-label` `top:42px`；`.table-message` `top:74px` |
| B6 | 两档断点切换无溢出 | ⚠️ 部分 | 断点数值与 `max-width`（120px / 76px）静态正确；"实际无溢出/过渡平滑"需渲染 |
| C1 | 1440×900 顶/底 6% 无关键信息 | ⛔ 无法判定 | cover 裁切实测，需渲染 |
| C2 | iPad 横 1180×820 | ⛔ 无法判定 | 同上 |
| C3 | iPad 竖 820×1180 | ⛔ 无法判定 | 同上 |
| C4 | iPhone 14 Pro 横 852×390 | ⛔ 无法判定 | 同上 |
| C5 | iPhone 14 Pro 竖 393×852 | ⛔ 无法判定 | 同上 |
| D1 | `.tiny` 在绿绒最深区可读 | ✅ | `#1f2e26` on `#fff5da` = **13.08:1**；托盘中心 0% 透明、边缘 30% 暗化已实现 |
| D2 | 红字 ≥ 4.5:1 | ✅ | `#b94742` on `#fff5da` = **4.78:1** |
| D3 | `.seat` 文字 ≥ 4.5:1 | ✅ | over 墙 `#526e60` = **5.14:1**；over 绿绒 `#245346` = **8.05:1** |
| D4 | `.table-message` ≥ 4.5:1 | ✅ | 两种落点 **6.11:1 / 8.38:1** |
| E1 | `.seat.active` 三重提示 | ⚠️ 部分 | 金环 + 深绿外环 + 独立 `<span class="turn-chip">` 均在；但角标语义存在 K1 缺陷 |
| E2 | `aria-label` + `tabindex="0"` | ✅ | 4 座均有 `tabindex="0"`；`renderSeats` 设置 `aria-label`，404 场景全部非空 |
| E3 | 焦点环 `#d88c24` 3px + offset 3px | ✅ | 静态确认 |
| E4 | reduced-motion 无脉冲/缩放 | ✅ | 0 处 `infinite`；reduced 覆盖 animation + transition 且含伪元素 |
| E5 | axe-core 0 critical / 0 serious | ⛔ 无法判定 | jsdom 无渲染引擎，`color-contrast` 等规则不执行 |
| F1 | 使用 `--ink`/`--gold`/`--cream` | ✅ | 确认 |
| F2 | 无 emoji；字体受限 | ✅ | emoji 0 处 |
| F3 | 圆角节奏 14/18/10/999 | ✅ | 逐条匹配 |
| F4 | 与侧栏视觉重量平衡 | ✅ | `.level` 12px 与 `.seat` 12px 一致 |
| G1 | 仅 CSS `backdrop-filter`，无 JS | ✅ | `app.js` 中 0 处 `backdrop`；含 `@supports` 纯色降级 `rgba(37,73,61,.78)`（R4） |
| G2 | `.tiny` box-shadow 不爆炸 | ✅ | 单层 2 段阴影 |
| G3 | 未新增资源请求 | ✅ | `url()` 仍 1 处（原 PNG），无 `<img>` |

**小计**：可判定 23 条 → PASS 21、PARTIAL 2（B6、E1）；**无法判定 8 条**（A3、A4、C1–C5、E5）。

### 4.2 `motion-spec.md` §F（30 条）

| 组 | ID | 判定 | 依据 |
|---|---|---|---|
| 结构 | 1 | ✅ | `render()` 拆为 7 个分区函数；`selection()` → `schedule()` 仍在末尾 |
| | 2 | ✅ | `Map<id,el>` 差集；出 6 张后 `handEls.size`=21=手牌数 |
| | 3 | ✅ | DOM 顺序 === `hands[0]`，含还贡后 `sort` 校正（R7） |
| | 4 | ✅ | `lastElementChild` 正确，`:last-child` 负边距未错位（R2） |
| | 5 | ✅ | round epoch 守卫，5 副零复用（见 §3-红线1） |
| | 6 | ✅ | MutationObserver：5 次 `render()` 后四座 `childList` 变更数 `[0,0,0,0]`；恒 4 子节点；chip 节点引用复用 |
| | 7 | ✅ | `#history`（仍全量重建、18 条上限）/ `#interpretation`（仍 `replaceChildren`）/ `#hint` / `#summary` 均未改 |
| 动效 | 8 | ✅ | 四方向 `--fy:44px`(南) / `--fx:64px`(东) / `--fy:-44px`(北) / `--fx:-64px`(西)，`.2s` ≤250ms |
| | 9 | ✅ | `--i` 上限 5（`Math.min(i,5)`），`calc(var(--i,0)*10ms)` 最大 50ms，200+50=250ms |
| | 10 | ✅ | `.seat` 本体**无** `transform`（`translateX(-50%)` 已不存在），环挂 `::after`，180ms（R2） |
| | 11 | ✅ | `translateY(-15px)` 未变 + `z-index:2` + `inset 0 0 0 2px`（R5 / 主理人裁定） |
| | 12 | ✅ | `cardOut .2s`；运行时 400ms 后桌面清空 |
| | 13 | ✅ | 连点提示 76 次、连点取消后，桌面牌组数 0（无重播） |
| | 14 | ✅ | 750ms bot 间隔 + 250ms 动画 = 1000ms |
| 性能 | 15 | ⛔ 无法判定 | DevTools Performance 的 Layout/Paint 计数，需浏览器 |
| | 16 | ✅ | 无 `transition` 作用于 width/height/margin/padding/top/left/border-width/box-shadow/background；`@keyframes` 仅 opacity+transform |
| | 17 | ✅ | `will-change` 全项目仅 1 处且在 `.fx` 类（无常驻）；并发实测 ≤8 |
| | 18 | ✅ | `.fx` 由 `animationend`（`once:true`）回收，实测归零 |
| | 19 | ⛔ 无法判定 | 真机 60/30fps |
| 无障碍 | 20 | ✅ | `.01ms` + `transition-duration` + `*::before,*::after` |
| | 21 | ⚠️ 部分 | reduced 下"瞬时正确 + 无泄漏"已实测；但"`.01ms` 确实派发 `animationend`"是浏览器 CSS 动画引擎行为，jsdom 无动画引擎，仅能验证 280ms 兜底路径（见 §6-7） |
| | 22 | ✅ | 关动效后信息完整：404 场景文本快照一致，`#hint` 仍输出"轮到你…" |
| | 23 | ✅ | 键盘出牌后 `activeElement` 为 `#hand` 内 `.card`，非 `body` |
| | 24 | ✅ | ARIA 属性未改 |
| 行为 | 25 | ✅ | 23/23 全绿 |
| | 26 | ✅ | 404 场景 × 24 字段逐字符一致 |
| | 27 | ✅ | 四态 + 还贡文案/隐藏 |
| | 28 | ✅ | 滚动位置保持（代码路径） |
| | 29 | ✅ | restart / deal / 贡 / 还贡 / 抗贡 全通 |
| | 30 | ✅ | 仅 `index.html` + `app.js` |

**小计**：PASS 27、PARTIAL 1（§21）、**无法判定 2**（§15、§19）。

### 4.3 `polish-plan.md` §4 交叉风险

| ID | 风险 | 判定 |
|---|---|---|
| R1 | 跨副 id 复用 | ✅ 已守卫（红线 1 全绿） |
| R2 | `.seat` transform 被 `translateX(-50%)` 占用 | ✅ 已消除：`.seat` 无 transform，环挂 `::after` |
| R3 | `animation:none` 致 `animationend` 不触发 | ✅ 用 `.01ms`；且已实现 280ms 兜底（后台标签页场景） |
| R4 | iOS 旧机型 `backdrop-filter` | ✅ 静态有 `@supports` 纯色降级；**实际降级表现无法判定** |
| R5 | 手牌重叠致抬起牌被压 | ✅ `z-index:2` 已加 |

---

## 5. 已知遗留复核（工程侧主动上报）

### K1 · `.turn-chip` 语义反了 —— **确认真实存在**｜严重度：**Major（非阻塞）**

**独立复现**：构造 `game.last[0]={pass:true}` + `game.turn=0` + 桌上有 `top`，渲染后：

```
seat0: class="seat south active idle"  chip="等待"
aria-label = "你 · 余 27 张 · 不要 · 等待"
#hint     = "轮到你，可压牌或不要"     ← 信息本身没丢
```

**真实对局频率**：在 404 个渲染场景的差分驱动中，`active + idle`（即 chip 显示"等待"）出现 **35 次**；其中轮到"你"（seat0）却显示"等待"的有 **9 次**。

**根因**：`idle = active && phase==='play' && !!(last && last.pass)`。`engine.js` 只在**三家全过牌清空桌面时**才重置 `game.last`；若某玩家在本 trick 内过牌后、另有玩家出牌（`passed` 被清空但 `last` 未重置），轮转回到他时 `last.pass` 仍为 `true` → 判定为 idle。

**门禁裁定**：**不算阻塞项**。理由：
1. 不阻塞任何游戏路径 —— 该玩家仍可正常出牌或不要；
2. 信息未丢失 —— `#hint`（`轮到你，可压牌或不要`）、`#table-message`、`.seat.active` 金环三处均正确指示；
3. 但它是**本轮新增**的无障碍功能，且 `aria-label` 尾部被追加"· 等待"，**读屏会把"该你出牌"念成"等待"** —— 属于新增功能的语义错误，不应带病结项。

**建议负责人**：设计侧（文策渊 / 林绘澄）裁决文案语义 → engineering-lead（程基岩）实施。
**建议修法**：`idle` 判定改为「active **且** 非当前行动者」，或直接在 `active` 时恒显示"轮到"、"等待"仅用于 `phase==='return'` 等待他人还贡的场景。

### K2 · ≤560 chip 裁切 —— **工程侧定位有偏差，实际风险点不同**｜严重度：**Minor**

工程侧报告的是"chip `top:-8px` 可能落在 `.room{overflow:hidden}` 上下边界被裁 1px"。独立几何推算结果：

- chip 顶边 = seat `top:8px` + seat `border:1px` + chip `top:-8px` = **距 room 顶部 1px** → **上下边界并未裁切**（工程侧原判断不成立）；
- 但 `.room` 有 `border-radius:25px`，chip 右边缘距 room 右边界仅 **5px**、顶边 1px → 其**右上角落在 25px 圆角弧外**，被裁掉的横向深度约 **3.7px**（随字形宽度浮动）。

**结论**：真实风险是**圆角裁角**而非上下边界裁切，且只影响 ≤560 的最右侧座位（south）。**精确像素需渲染确认**（字形度量不可静态获得）。

**建议负责人**：engineering-lead。建议 ≤560 下 chip 改 `right:0`（或 seat `top:12px`）留出余量。

### K3 · 手牌出完时焦点兜底落到 `#clear` —— 确认｜严重度：**Minor**

`moveFocus` 的兜底序列为 `['#play','#pass','#clear']`；手牌出完时 `phase` 转 `over` → `#play` / `#pass` 均 `disabled` → 落到 `#clear`。功能上不丢焦点（未掉到 `body`），但语义上更应落到 `#next`（下一副）。

**建议负责人**：engineering-lead。建议兜底序列加入 `#next`（并考虑 `hidden` 过滤）。

---

## 6. 「本环境无法判定」专项清单（🔴 严禁假判为通过）

以下条目**只能由真机 / 真实浏览器渲染 / DevTools 判定**，本报告一律记为 **UNVERIFIED**，不计入通过数：

1. **真机帧率**：macOS Chrome/Safari 60fps、iOS Safari ≥30fps，Frames 轨道无长帧（motion §F-19）。
2. **DevTools Performance 的 Layout / Paint 计数为 0**（motion §F-15）—— 只完成了"CSS 不含 layout 属性动画"的静态等价检查。
3. **`prefers-reduced-motion: reduce` 下 `.01ms` 是否确实派发 `animationend`**（motion §F-21 / R9 的核心）：jsdom 无 CSS 动画引擎，`animationend` 永不触发，因此**只验证了 280ms 兜底路径**；"`animationend` 会正常触发因而节点不泄漏"这一论断本身**未被本环境验证**，属规范推理。
4. **iOS Safari `backdrop-filter` 的实际渲染与降级表现**（R4）—— 仅确认存在 `@supports` 纯色降级。
5. **iOS Safari 滚动容器内合成 / 惯性滚动期间 DOM 插入跳动**（motion E-R11）。
6. **真实视觉遮挡效果**：A3（四角色面部未被覆盖）、A4（木环与虚线圈可见）、C1–C5（5 种视口下 cover 裁切后的 UI 落点）。
7. **axe-core 自动扫描 0 critical / 0 serious**（overlay E5）—— jsdom 无渲染，`color-contrast` 等规则不执行；对比度为**手工算术计算**（见 D1–D4），非 axe 实测。
8. **`<dialog>` 的 `showModal()` / `close()` 原生行为** —— jsdom 未实现，测试中做了 polyfill，故 `#rules-modal` / `#restart-modal` 的真实模态行为（焦点陷阱、`::backdrop`、ESC 关闭）**未验证**。
9. **手牌横向 `scrollLeft` 的真实 clamp 行为** —— jsdom 无布局，仅验证了"读—写回"代码路径未被破坏；浏览器在 `scrollWidth` 变窄时的自动 clamp（motion E-R1 的真实语义）**未验证**。
10. **8–10 张牌在 `.felt-played` 内的实际换行与是否溢出托盘** —— `flex-wrap` + `max-width` 静态存在，实际尺寸需渲染。
11. **`backdrop-filter` 的视觉与性能开销** —— 共 3 处规则：`.seat`（`blur(6px) saturate(1.15)`，4 张名片常驻）、`.table-message`（`blur(4px)`）、`.room-label`（`blur(4px)`）。
12. **K2 的精确裁切像素** —— 依赖 PingFang SC 实际字形宽度，静态不可得。

---

## 7. 阻塞项与跟进项清单

### 阻塞项（Blocker / Critical）
**无。**

### 跟进项

| ID | 严重度 | 内容 | 建议负责人 | 建议时点 |
|---|---|---|---|---|
| K1 | **Major** | `.turn-chip` 语义反了：轮到该玩家时角标与 `aria-label` 显示"等待"（实测 35/404 场景，涉"你"9 次） | 设计侧裁决 → engineering-lead 实施 | **发布前必须修复** |
| K2 | Minor | ≤560 最右座位 chip 右上角被 `.room` 25px 圆角裁约 3.7px | engineering-lead | 发布前（含真机确认） |
| K3 | Minor | 手牌出完时焦点兜底落到 `#clear`，应优先 `#next` | engineering-lead | 发布前 |
| N1 | Info | `#table-cards` 在清桌后 200ms 内仍含旧组文本（过牌淡出，设计使然）。已有 404/404 稳定态比对佐证非缺陷 | — | 无需处理，存档 |
| N2 | Info | `renderSummary` 在 `phase==='over' && result===undefined` 时抛 `TypeError`（`r.team`）。正常流程不可达（`settle()` 总先设 `result`），仅健壮性缺口 | engineering-lead | 可选 |
| N3 | Info | `fxEls` 给每张 `.tiny` 加 `.fx`，而 motion-spec C.2 建议给 `.group` 容器加一次。并发 ≤8 仍成立，属轻量偏离 | engineering-lead | 可选 |
| U1–U12 | — | §6 的 12 项 UNVERIFIED，需真机/浏览器验收补齐 | quality-lead + 主理人 | 发布前真机冒烟 |

---

## 8. 结论

改动**严格限定**在 `index.html` 与 `app.js`，五条红线项全部实测通过，180 项断言零失败，与改造前的 404 场景逐字符比对**零意外差异**。核心隐蔽坑 R1（跨副 id 复用）已被 round epoch 守卫正确封堵，本轮最担心的"偶发鬼牌"类问题在 5 副连续发牌与 8 副全场 E2E 中均未复现。

**门禁判定：CONCERNS —— 可结项，但 K1 必须在发布前修复，K2 / K3 建议同批处理；§6 的 12 项 UNVERIFIED 需真机冒烟补齐，不得以本报告替代。**

> 本门禁为**建议性门控（advisory）**，最终放行由用户决定。

---

### 附：复现方式

```bash
cd /tmp/qa-yanshouzhen
node static-checks.cjs    # 68 项静态
node runtime-tests.cjs    # 68 项运行时（含 404 场景差分）
node extra-tests.cjs      # 21 项专项
cd /Users/gitana/Desktop/Doc/codex/wb/gd && node tests/rules.test.cjs   # 23 项引擎回归
```
