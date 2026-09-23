# P6-QA-02 · 复验报告 / QA Recheck Report

| 项 | 值 |
|---|---|
| Task ID | P6-QA-02（承接 P6-QA-01） |
| 角色 | 严守真 · quality-lead |
| 上一轮判定 | 🟡 CONCERNS（K1 Major / K2 Minor / K3 Minor） |
| 复验依据 | `design/polish/turn-chip-semantics.md`（design-strategist 裁决，turn-based 10 态状态机） |
| 被测改动 | K1/K2/K3 修复（`app.js` 66→85 行、`index.html` 内联 CSS） |
| 方法 | 独立静态分析 + **全新独立 jsdom 环境** `/tmp/qa-recheck`（jsdom@24 现装；**未复用** `/tmp/domtest`，**也未复用**上轮的 `/tmp/qa-yanshouzhen`）+ 独立实现 Oracle 对照 |
| 日期 | 2026-09-10 |

---

## 1. 最终门禁判定

# 🟡 CONCERNS（可结项）

**一句话理由**：K1 与 K2 经独立复验**确认修复且证据充分**（角标语义错误 35→0、不变量违例 0/1604、圆角裁切 13px→0px、10 态全覆盖），无新增回归；但 K3 只修好了「本副结束」这一种情形——**人类走完头游而本副未结束时，焦点仍会落到同一渲染内随即被禁用的 `#play`**，属同一缺陷类的残留，且发生在常见路径上。

- **可结项**：是
- **阻塞项**：无（未发现 Blocker / Critical）
- **剩余跟进**：1 项（**K3-R**，Major 非阻塞，1 行修复）

> 判定口径沿用 P6-QA-01：PASS = 无跟进项；CONCERNS = 可结项但需列出跟进项与负责人；FAIL = 有阻塞项。

---

## 2. 测试执行总览

| 套件 | 环境 | 断言数 | 通过 | 失败 |
|---|---|---|---|---|
| 静态复验（CSS/HTML/JS 结构 + K2 几何） | Node 22.22.2 | 42 | 42 | 0 |
| 运行时复验（K1 十态 + A3/A4/A5/A7/E1 + 回归） | jsdom（独立） | 52 | 52 | 0 |
| 与 pre-polish 基线差分 | jsdom（独立） | 6 | 6 | 0 |
| 引擎回归 `node tests/rules.test.cjs` | Node | 23 | 23 | 0 |
| K3 焦点边界探测 | jsdom（独立） | 4 + 3 | 5 | **4** |
| **合计** | | **133** | **129** | **4**（全部为 K3-R） |

语法检查：`node --check app.js` ✅ / `node --check engine.js` ✅

> 独立性声明：依赖仅 `jsdom@24`，全新安装于 `/tmp/qa-recheck/node_modules`；未读取 `/tmp/domtest`；未复用上轮 `/tmp/qa-yanshouzhen` 的任何脚本或结论（本轮 harness 与 Oracle 全部重写）。项目 `package.json` 与 `node_modules` 未改动。

### 2.1 Oracle 独立性

K1 的对照基准**不是**从 `app.js` 抄来的，而是我按 `turn-chip-semantics.md` §3.0 判定顺序 + §3.1 文案表**手工重新实现**的（`harness.cjs` 的 `oracleChip` / `oracleAria` / `canAct`）。被测实现与 Oracle 在 1604 次座位采样上逐点比对。

---

## 3. K1 复验 —— ✅ 通过

### 3.1 核心结果

| 指标 | 上一轮（旧实现） | 本轮（新实现） |
|---|---|---|
| 角标语义错误（有行动权却显示「等待」） | **35** | **0** |
| 不变量违例（角标可见 ⟺ `.seat.active` ⟺ 可立即行动） | 35 | **0 / 1604** |
| 角标与独立 Oracle 不一致 | — | **0 / 1604** |
| 角标取值越界 | — | **0**（域闭合于 `{'', 领出, 轮到, 还贡}`） |
| `aria-label` 后缀越界或为空 | — | **0**（后缀恒非空） |
| `aria-label` 与 Oracle 不一致 | — | **0 / 1604** |
| 10 态覆盖 | 4 态 | **10 / 10** |

> 旧错误数 35 是我在**同一采样集**上用旧逻辑复刻代码跑出的（旧实现：35；新实现：0），与上轮报的 35/404 场景、涉"你" 9 次**完全对齐**（按座位分布 `[9,10,8,8]`，seat0=9）。design-strategist 报的 113 次是 60 副 / 3868 采样的不同口径，量级同向（2.2% vs 2.9%），三者互证。
>
> 换算成**「轮到该玩家」的比例**：400 次有行动权的采样中 35 次被误标，即**每 11 次轮到你就有 1 次角标说谎** —— 印证了上轮 Major 的定级。

### 3.2 分布证据

角标分布（1604 次座位采样）：

```
(空) 1204  轮到 324  领出 64  还贡 12      ← 无「等待」，turn-based 达成
```

`aria` 后缀分布（**10 态全覆盖**）：

```
等待中 542 · 轮到，可压牌或不要 324 · 等待其他玩家回应 314 · 已不要，等待中 266
轮到，领出，不能不要 64 · 已走完 50 · 本副结束 16 · 等待对方还贡 12
轮到，需要还贡 12 · 本场结束 4
```

附加收益：旧实现在 1204 次非活动座位采样上**不追加任何后缀**（读屏只能靠"没有后缀"反推，否定式信息）；新实现 10 态后缀恒非空。

### 3.3 逐条判据（`turn-chip-semantics.md` §6）

| # | 判据 | 结果 | 实测 |
|---|---|---|---|
| A1 | 不变量：角标非空 ⟺ 有行动权 ⟺ `.seat.active` | ✅ | 1604 次采样，**违例 0** |
| A2 | 角标取值域闭合于 `{'',领出,轮到,还贡}` | ✅ | 越界 0 |
| A3 | `turn===i && phase==='play'` 时绝不为「等待」 | ✅ | 构造 `last[0].pass=true` + `top` + `turn=0` → 输出**「轮到」**；`<em>` 仍显示「不要」（信息已归还 em）；aria 后缀「轮到，可压牌或不要」 |
| A4 | 重新领出 `turn===i && !top` ⇒ 「领出」 | ✅ | chip=「领出」；aria「轮到，领出，不能不要」；`#pass` 已禁用；`#hint`「轮到你领出，不能不要」 |
| A5 | 接风：走完方对家 `top===null` ⇒ 「领出」 | ✅ | 走真实引擎路径：seat1 出完 → 三家全过 → `turn=3`、`top=null`、seat3 chip=**「领出」**；已走完的 seat1 chip=空、aria「已走完」（未被误判） |
| A6 | aria 后缀恒非空且 ∈ 10 态集合 | ✅ | 空值 0；越界 0；**10/10 态覆盖**（含终局「本场结束」单独补采） |
| A7 | 单贡 1 张 / 双贡 2 张 / 抗贡 0 张 | ✅ | 双贡 `returns` 2 条 → **恰好 2 张「还贡」**（seat0、seat2），进贡方（seat1、seat3）无角标；抗贡 `phase='play'`、`returns=0` → **0 张**，头游显示「领出」，全局仅 1 个角标 |
| A8 | 无以颜色为唯一区分的角标状态 | ✅ | `.turn-chip` 的 `background` 仅 1 处（`var(--gold)`）；`.seat.idle` 规则 0 处 |
| A9 | ≤560 宽度不回归 | ✅ | 最长文案 2 字（领出/轮到/还贡）≤ 旧「等待」2 字；`white-space:nowrap` 保留 |
| A10 | chip 带 `aria-hidden`；`.seat` 无 `aria-live` | ✅ | 运行时 4/4 座位 `aria-hidden="true"`；无 `aria-live` |

### 3.4 双贡例外专项（设计侧 §3 S3 / E2）

双贡是本轮唯一允许 ≥2 个角标的场景，重点核验：

```
returns = [{from:0,to:1},{from:2,to:3}]
chips   = [还贡, "", 还贡, ""]
```

- ✅ 显示「还贡」的张数（2）=== `returns` 条目数（2）
- ✅ 每张「还贡」都落在 `returns[].from`（收贡方 / 还贡义务人）—— `from`/`to` 方向与设计文档 §5.5 一致，**未被变量名互换误导**
- ✅ 进贡方（`returns[].to`）不显示角标，aria 后缀「等待对方还贡」
- ✅ 两张「还贡」卡同时带 `.seat.active`（不变量在例外场景下仍成立）
- ✅ 抗贡对照组：0 张「还贡」、全局 1 个角标（turn-based「同一时刻最多一个角标」收益达成）

### 3.5 结构性前提

`chipText()` 未检查 `finished`（与 §3.0 的 S6 顺序略有出入）。我单独验证了该差异**不可达**：1604 次采样中「已走完座位同时是 `turn`」出现 **0 次**（引擎 `next()` 跳过空手牌、`settle()` 兜底）。故省略判定等价，无需修改。

---

## 4. K2 复验 —— ✅ 通过

### 4.1 修复内容确认

- `.seat.east .turn-chip,.seat.south .turn-chip{right:4px}`（默认断点）
- `.seat.south .turn-chip{top:-2px;right:4px}`（≤560 断点）

### 4.2 几何计算（`.room` `border-radius:25px` + `overflow:hidden`）

| 位置 | 修复前 | 修复后 |
|---|---|---|
| ≤560 south chip 顶边距 room 顶部 | 1px（**未被上下边界裁切**） | **7px** |
| ≤560 south chip 右边缘距 room 右边界 | 5px | **13px** |
| ≤560 south chip 被 25px 圆角裁掉的最大横向深度 | **13px** | **0px** ✅ |
| 默认断点 east chip（最接近右上圆角） | 裁切 0px（余量仅 1px） | 裁切 0px（余量 **11px**） |
| ≤560 east（顶部条中部，距右边界 ≈116px） | 不在圆角区 | 不在圆角区 ✅ |

> **⚠️ 更正上一轮报告**：P6-QA-01 中我报的「裁切约 3.7px」**偏小且有误** —— 当时脚本在 `cut = d - bound(y)` 一步取了符号，实际被裁掉的是 chip 顶部若干行的**右侧三角区域**，最大横向深度约 **13px**（y=1 处最深，随 y 增大收敛，约 y=10 后归零）。本轮已修正计算并重新验证。结论方向不变（确实被裁），**严重度实为 Minor 偏上**；现已归零。

---

## 5. K3 复验 —— ⚠️ 部分通过（主场景 ✅，兜底链 ❌）

### 5.1 已修复部分

| 场景 | 结果 |
|---|---|
| 手牌出完 **且本副结束**（`phase='over'`、`champion` 未定） | ✅ 焦点落到 **`#next`**，且该元素未被禁用/隐藏 |
| 普通出牌（手牌未出完） | ✅ 焦点仍在 `#hand` 内邻近牌，未被 K3 改动破坏 |
| `renderControls()` 已先于 `renderHand()` | ✅ 静态确认，注释说明原因 |
| 兜底序列含 `#next` 且同时过滤 `disabled` 与 `hidden` | ✅ 静态确认 |

### 5.2 K3-R · 残留缺陷（**新发现·本轮唯一失败项**）

**现象**：`moveFocus` 的兜底会选中一个**在同一渲染内随即被禁用**的按钮，真实浏览器会 blur 它 → 焦点掉回 `<body>`。

**根因**：`render()` 的调用顺序是 `…renderControls(); renderHand(); renderSummary(); renderHistory(); selection(); schedule();`。`moveFocus` 在 `renderHand()` 内执行，而 `#play.disabled` 直到**最后的 `selection()`** 才刷新 —— 因此兜底读到的是**上一次渲染的陈旧值 `false`**。

**两种触发形态（均已实测复现）**：

| 形态 | 触发条件 | `#next` | 落点 | 渲染后 `#play` | 结果 |
|---|---|---|---|---|---|
| **D（常见）** | 人类走完**头游**但本副未结束（`finished=[0]`、`phase='play'`） | hidden | `#play` | `disabled=true` | ❌ 焦点丢失 |
| **B（罕见）** | 出完最后一张且**过 A 成功**（`champion` 已定） | hidden | `#play` | `disabled=true` | ❌ 焦点丢失 |

实测数据（形态 D）：

```json
{"finished":[0],"phase":"play","turn":1,"nextHidden":true,
 "playDisabled_点击前":false,"focused":"play","focusedDisabled":true,
 "playDisabled_渲染后":true,"passDisabled":true,"clearDisabled":false}
```

**可达性**：形态 D **不罕见** —— 只要人类先走完（`settle()` 需 2/3 家才结算，头游不触发），就会命中。即 **K3 名义上修好的"手牌出完"场景里，最常见的一种仍未修好**。

**归因**：**非本轮引入**。K3 修复前的兜底是 `['#play','#pass','#clear']`，同样会落到 `#play`；P6-ENG-02 之前连 `moveFocus` 都没有（一律掉 body）。故本轮**无回归**，但 K3 的修复**未覆盖到这条主路径**。

**建议修法（1 行）**：把永不被禁用的 `#clear` 提到 `#play` 之前 ——
```js
['#next','#clear','#play','#pass']        // #clear 恒可用，保证落点始终有效
```
（`#next` 仍列首位，本副结束场景不受影响；形态 D/B 会落到 `#clear`，比掉 body 好。）
备选：把 `selection()` 移到 `renderHand()` 之前 —— 兜底能读到新鲜值，但会打破 `motion-spec.md` §F-1「`selection()` 与 `schedule()` 在末尾按序调用」，故不推荐。

**严重度**：**Major（非阻塞）** —— 位于常见路径、属无障碍焦点顺序（WCAG 2.4.3）问题，与 K1/K3 同一缺陷类且是我上轮明确要求修复的；但不阻塞任何玩法路径。
**建议负责人**：engineering-lead（程基岩）。

---

## 6. 回归检查 —— ✅ 无新增问题

| 检查项 | 结果 |
|---|---|
| `node tests/rules.test.cjs` | **23 / 23 全绿** |
| `node --check app.js` / `engine.js` | OK |
| `engine.js` 与 pre-polish 快照 | **逐字节相同** |
| `room.html` / `room.js` | **逐字节相同** |
| `server.cjs` | mtime **09-09 19:54**，早于打磨与本次修复，未触碰 |
| `package.json` | mtime 09-09 20:25，未修改 |
| 改动范围 | 仅 `index.html` + `app.js`（全目录 mtime 扫描，无越界文件） |
| 与 pre-polish 基线差分 | **24 个渲染字段 × 400 场景全部一致**；座位 strong/span/em/class 全场景一致；桌面稳定态文本 400/400 一致 |
| 有意差异归因 | 71/400 处「离场中旧牌组」差异 **100%** 发生在 `game.top===null` 的清桌瞬间（P6-ENG-02 的过牌淡出动效，有意新增），非缺陷 |
| `.seat.idle` 残留 | app.js 与 CSS 中 `idle` 出现 **0 次** |
| 运行时 `.idle` 元素 | 0 |
| R1 round epoch（5 副） | 27 张 / 零复用 / 顺序一致 / 无残留 `aria-pressed` / badge 一致 / 无错误飞入 —— 全绿 |
| `selected` ↔ `aria-pressed` 同步 | 8 轮交互，不同步 0 |
| 还贡态 `#play` 文案 / 轮到电脑禁用 | 保持正确 |
| 座位子节点只建一次 | 3 次 render 后 `childList` 变更 0；恒 4 子节点 |
| reduced-motion 无泄漏 | reduced=true/false 双路：离场节点 0 残留、`.fx` 0、30 轮后 DOM 节点不增长 |
| 全场 E2E（跑到 champion） | 无异常，终局不变量仍成立，`handEls.size` 与 DOM 顺序一致 |
| P6-QA-01 其他已通过项 | `.felt` 0 / `.watermark` 0 / keyframes 只动 opacity+transform / `.01ms` / `will-change` 无常驻 / `translateY(-15px)`+`z-index:2` / 280ms 兜底 —— 全部保持 |

---

## 7. 本环境无法判定清单（UNVERIFIED · 严禁假判通过）

沿用并更新 P6-QA-01 的清单，**本轮新增 2 项**：

1. **真机 60/30fps**（motion §F-19）
2. **DevTools Performance 的 Layout / Paint 计数为 0**（motion §F-15）—— 只做了"CSS 不含 layout 属性动画"的静态等价检查
3. **`prefers-reduced-motion` 下 `.01ms` 是否确实派发 `animationend`**（R9 核心）—— jsdom 无 CSS 动画引擎，本轮与上轮**均只验证了 280ms 兜底路径**；该论断仍属规范推理
4. **iOS Safari `backdrop-filter` 实际渲染与降级表现**
5. **iOS Safari 滚动容器内合成 / 惯性滚动跳动**（motion E-R11）
6. **真实视觉遮挡**：overlay A3（四角色未被覆盖）、A4（木环可见）、C1–C5（5 种视口 cover 裁切后落点）
7. **axe-core 0 critical / 0 serious**（overlay E5）—— jsdom 无渲染，`color-contrast` 不执行；本报告对比度为手工算术
8. **`<dialog>` 原生行为**（`showModal` / 焦点陷阱 / `::backdrop` / ESC）—— jsdom 未实现，测试中做了 polyfill
9. **手牌 `scrollLeft` 的真实 clamp 行为**（motion E-R1 的真实语义）—— jsdom 无布局，仅验证读—写回代码路径
10. **8–10 张牌在 `.felt-played` 内的实际换行与溢出**
11. **`backdrop-filter` 视觉与性能开销**（3 处规则：`.seat` / `.table-message` / `.room-label`）
12. **K2 的精确裁切像素** —— 依赖 PingFang SC 实际字形宽度，静态不可得；本报告为**几何推算**（"裁切深度 13px → 0px"是推算值，非渲染实测）
13. 🆕 **「禁用已聚焦元素 → 浏览器 blur → 焦点回 body」**（K3-R 的关键一步）—— jsdom 不实现该行为（实测中 `activeElement` 仍停在 `disabled` 的 `#play`）。**落点被禁用已确定性验证；焦点最终是否掉到 body 属规范推断，需真机确认**
14. 🆕 **`aria-hidden` 在真实 AT 下的效果** —— 静态与运行时属性存在性已验证；实际读屏是否忽略角标文本未验证

---

## 8. 跟进项清单

| ID | 严重度 | 内容 | 建议负责人 | 时点 |
|---|---|---|---|---|
| **K3-R** | **Major（非阻塞）** | 兜底焦点落到随即被禁用的 `#play`：人类走完头游而本副未结束时（常见）/ 过 A 成功时（罕见），键盘焦点掉回 body。修法：兜底序列改 `['#next','#clear','#play','#pass']` | engineering-lead | **发布前** |
| N1 | Info | 桌面清桌后 200ms 内仍含旧组文本（过牌淡出，设计使然），400/400 稳定态比对佐证非缺陷 | — | 存档 |
| N2 | Info | `renderSummary` 在 `phase==='over' && result===undefined` 时抛 `TypeError`；正常流程不可达，仅健壮性缺口 | engineering-lead | 可选 |
| U1–U14 | — | §7 的 14 项 UNVERIFIED，需真机/浏览器补齐 | quality-lead + 主理人 | 发布前真机冒烟 |

**已关闭**：K1（P6-QA-01 Major）✅ / K2（P6-QA-01 Minor）✅ / K3 主场景 ✅

---

## 9. 结论

K1 的修复质量**高于预期** —— 设计侧改用 turn-based 后，不变量「角标可见 ⟺ `.seat.active` ⟺ 可立即行动」在 1604 次独立采样上零违例，且 10 态 `aria-label` 全覆盖、后缀恒非空，把上轮的**否定式信息**一并修掉。K2 经修正几何口径后确认从 13px 裁切归零。两者均可判定关闭。

唯一未竟项是 K3：修复只覆盖了「本副结束」分支，而**更常见的「走完头游但本副未结束」分支仍会丢焦点**。它不涉及玩法、不影响鼠标用户，但落在常见路径且属无障碍焦点顺序问题，因此给出 **CONCERNS** 而非 PASS —— **可结项**，带走 1 项 1 行修复的跟进即可转 PASS。

> 本门禁为**建议性门控（advisory）**，最终放行由用户决定。

---

### 附：复现方式

```bash
cd /tmp/qa-recheck
node static-recheck.cjs     # 42 项静态（含 K2 几何）
node runtime-recheck.cjs    # 52 项运行时（K1 十态 + 回归）
node diff-baseline.cjs      # 6 项与 pre-polish 基线差分
node old-error-count.cjs    # 同一采样集上旧实现 vs 新实现的错误数（35 → 0）
node k3-edge.cjs            # K3 边界：本副结束 / 本场结束
node k3-edge2.cjs           # K3 边界：走完头游但本副未结束（K3-R）
cd /Users/gitana/Desktop/Doc/codex/wb/gd && node tests/rules.test.cjs   # 23 项引擎回归
```
