# 牌桌区覆盖层视觉规格 / Overlay Spec

> Task: P6-ART-01 · 美术指导 · 输出: `design/polish/overlay-spec.md`
> 范围: 仅 `.room` 内部覆盖层与图片呈现。HTML/CSS 实现由工程协同。
> 设计原则（用户确认，不变）: **图当主角，UI 让位**。

---

## 0. 背景图基线

- 资源: `assets/guandan-club-v2.png`（1536 × 1024，3:2）
- 当前背景: `.room` 使用 `background: #c6b58c url(...) center 45% / cover`
- 视口定档: 现有断点 1200 / 950 / 560 三档；本规格聚焦 ≤950 与 ≤560
- 容器宽高比会随断点变化:

  | 断点 | 容器典型宽×高 | 容器比 | 与图 3:2 比较 | 裁切方向 |
  |---|---|---|---|---|
  | ≥1200 (桌面) | ~1115×440 | 2.53 | 图更窄 | **上下裁** |
  | 951–1199 | ~874×430 | 2.03 | 图更窄 | **上下裁** |
  | 561–950 | ~874→窄, 430高 | ~2.0 | 图更窄 | **上下裁** |
  | ≤560 | ~530×410 | 1.29 | 图更宽 | **左右裁** |
  | iPad 横 (1180×820 room~1140×600) | 1.90 | 图更窄 | **上下裁** |
  | iPad 竖 (820×1180 room~780×900) | 0.87 | 图更宽 | **左右裁** |

  结论: **桌面与平板以"上下裁"为主；手机以"左右裁"为主**。两套 UI 锚点策略都必须成立。

---

## 1. 概念图安全区划分

### 1.1 1536×1024 原图坐标 → 百分比

下表中所有百分比均**相对原图**，落地到 CSS 时配合 `object-position` 或作为可视参考；DOM 锚点最终相对 `.room` 容器，需见 §1.3。

| 区域 | 原图近似 px | 百分比 (h%, v%) | 性质 |
|---|---|---|---|
| 北位人物（深绿衣，正面像）头部与上身 | x:580–960, y:60–360 | h 38%–62%, v 6%–35% | **绝对不可遮挡** |
| 东位人物（眼镜紫背心）头部与手 | x:1180–1470, y:160–540 | h 77%–96%, v 16%–53% | **绝对不可遮挡** |
| 西位人物（棕发女）头部与手 | x:90–360, y:200–610 | h 6%–23%, v 20%–60% | **绝对不可遮挡** |
| 南位人物（背影，后脑勺） | x:600–920, y:580–1020 | h 39%–60%, v 57%–100% | **绝对不可遮挡** |
| 牌桌桌面（外圈实木环） | x:340–1200, y:350–800 | h 22%–78%, v 34%–78% | **绝对不可遮挡**（不画假桌） |
| 牌桌桌面（内圈虚线绿绒） | x:415–1125, y:410–740 | h 27%–73%, v 40%–72% | 可放 .tiny 出牌；不画底色 |
| 窗框上方留白（墙面+窗） | x:520–1015, y:0–40 | h 34%–66%, v 0%–4% | 可放横向居中条幅（.table-message） |
| 左上角灯+植物 | x:0–200, y:0–200 | h 0%–13%, v 0%–20% | 可放 .room-label 与 west 名片 |
| 右上角灯+植物 | x:1336–1536, y:0–260 | h 87%–100%, v 0%–25% | 可放 east 名片 |
| 左下角地板+椅腿 | x:0–220, y:820–1024 | h 0%–14%, v 80%–100% | 可放 west 名片（窄屏备用） |
| 右下角地板+椅腿 | x:1316–1536, y:820–1024 | h 86%–100%, v 80%–100% | 可放 east 名片（窄屏备用） |
| 桌面与南位之间的木环前沿 | x:240–1296, y:780–830 | h 16%–84%, v 76%–81% | **不可遮挡**（实木环细节） |

### 1.2 UI 锚点优先级

```
P0（必须可见）: .table-message, 活动 .seat.active 描边
P1（应当可见）: 四张 .seat 名片
P2（次要可去）: .room-label, .watermark
```

### 1.3 cover 裁切下的补偿策略

> 核心矛盾: cover 会随容器比裁掉图片顶/底或左/右；UI 必须落"在裁切后仍然可见"的位置。

**桌面默认（宽屏）**:
- 图上下裁 → 顶部 v 0%–6% 与底部 v 94%–100% 不稳定；中部 v 8%–92% 永远可见
- UI 落点: 北/西/东名片落在画面**中部偏上** (v 6%–18%)；南名片落在 v 84%–94% (图片下沿安全区内)

**手机 (≤560px)**:
- 图左右裁 → 中部 h 12%–88% 永远可见；左右两端 h 0%–12% 与 h 88%–100% 不稳定
- UI 落点切换: 4 张名片改水平排列于 v 2%–12% 的顶部条；消息条与出牌区保持中心

**实现手法**:
- 名片用 `position: absolute; inset-block-start/end + inset-inline-start/end` 写为「相对 `.room` 容器」的百分比/像素；不要写相对图片
- 不用 `background-position` 同步 UI；UI 跟随容器，图片跟随 `cover`
- 在窄屏媒体查询中重排锚点（见 §3.3）

---

## 2. `.felt` 替代方案

**决策**: **删除 `.felt` 整个伪牌桌层**。图里已有真牌桌。

### 2.1 出牌托盘 `.felt-played`（新建，替代原 `.felt` 承担出牌承载）

只服务于 `.table-cards`（.tiny 牌堆）与可选的临时高亮，不画绿色桌面：

```
.felt-played{
  position:absolute;
  /* 落在原图桌面虚线圈内部，h 30%–70%, v 44%–68% */
  left:30%; right:30%;
  top:46%; bottom:30%;
  min-height:96px;

  /* 仅在出牌存在时叠加；空桌完全透明 */
  background:radial-gradient(ellipse at 50% 50%,
    rgba(20,40,32,0) 0%,
    rgba(20,40,32,0) 55%,
    rgba(20,40,32,0.18) 80%,
    rgba(20,40,32,0.30) 100%);
  border-radius:60%;

  display:flex; align-items:center; justify-content:center;
  padding:8px 14px;

  pointer-events:none;       /* 牌堆本身不接收事件 */
}
```

要点:
- **0% 中心透明** → 真桌面纹理完整可见
- **边缘 30% 暗化** → 仅在边缘提供轻微对比缓冲，让散落的 .tiny 在绿绒与红桃/方块上仍然可读
- 不画边框、不画阴影、不画木环 —— 让位给原图

### 2.2 `.tiny` 可读性对比度保障

现状（保留）: `background:#fffdf3; color:#2e463d; border:1px solid #d5c49b; box-shadow:0 3px 0 #cbb995`

**追加**:
```
.tiny{
  background:#fff5da;          /* 比 #fffdf3 略暖，与绿色牌桌区分更强 */
  color:#1f2e26;
  border:1px solid #6b4a2a55;
  box-shadow:0 2px 0 #6b4a2a40, 0 4px 10px #0a1a1450;
  padding:6px 8px;
  min-width:30px;
  font:bold 18px Georgia,serif;
  text-align:center;
  /* 牌身白底保证 .red (#b94742) 对比 ≥ 4.5:1 */
}
.tiny.red{color:#b94742;}
```

对比度自检:
- 白底 `#fff5da` 与深字 `#1f2e26` ≈ **12.4:1** ✓ AAA
- 白底与红字 `#b94742` ≈ **5.1:1** ✓ AA 正文
- 在最暗处的绿绒（采样 #1F6F5C）上叠加后，等效背景 ≈ `#3e8a72`；白底 `#fff5da` 与之对比 ≈ **3.0:1** ⚠ 临界 → **依赖 30% 暗化 scrim 边缘**将散牌轻微抬高对比；若 QA 实测 < 3:1，则在 `.felt-played` 中心提高暗化值至 0.40

### 2.3 `.watermark` 决策: **删除**

理由: 与"图当主角"冲突，是装饰冗余。如需品牌识别，迁至顶部 `.room-label` 副文案即可。

---

## 3. `.seat` 四张名片的新落点与样式

### 3.1 信息层级（一卡三行，自上而下）

```
[昵称 + 队友标记]            ← 14px bold, --ink
[余 X 张 | 头游/二游/末游]   ← 12px, --green
[不要 | 牌型名]              ← 11px italic normal, #8b7959
```

最大宽度限制: `max-width:140px`（宽屏）/ `max-width:96px`（≤560）

### 3.2 默认落点（≥951px，四角四卡 + 错位避让）

```
/* 北 → 左上角，避开北位中央头部 */
.seat.north{ top:14px; left:16px; }

/* 东 → 右上角，避开东位右脸 */
.seat.east{  top:14px; right:16px; }

/* 西 → 左下角，避开西位左脸与身体 */
.seat.west{  bottom:80px; left:16px; }   /* 抬高于椅腿 */

/* 南 → 右下角，避开南位后脑勺 */
.seat.south{ bottom:14px; right:16px; }
```

四卡形成"外环"，桌面中心与人物完整露出。

### 3.3 ≤950px（平板与中小屏）

保持四角四卡，但缩小字号与内边距:
```
.seat{ min-width:88px; padding:7px 10px; font-size:11px; }
.seat strong{ font-size:13px; }
.seat em{ font-size:10px; }
.seat.north{ top:12px; left:12px; }
.seat.east{  top:12px; right:12px; }
.seat.west{  bottom:64px; left:12px; }
.seat.south{ bottom:12px; right:12px; }
.room{ min-height:430px; }
```

### 3.4 ≤560px（手机竖屏，cover 改为左右裁）

图片左右被裁，东西两侧 h 0%–12% 与 h 88%–100% 不稳定 → **四卡改水平顶部栏**:
```
.seat{
  position:absolute;
  top:8px;
  min-width:62px; max-width:76px;
  padding:5px 6px;
  font-size:10px;
}
.seat strong{ font-size:11px; }
.seat em{ font-size:9px; }
/* 四等分顶部条，按 inline 顺序从左到右排成一线 */
.seat.west{ left:8px;  top:8px; }
.seat.north{ left:calc(25% + 6px); top:8px; }
.seat.east{ left:calc(50% + 6px); top:8px; }
.seat.south{ right:8px; top:8px; }
.room-label{ left:8px; top:42px; }   /* 让位给顶部卡条 */
.table-message{ top:74px; }          /* 落窗框留白带 */
.room{ min-height:410px; }
```

### 3.5 名片样式（统一基线）

```
.seat{
  position:absolute;
  background:rgba(37,73,61,0.78);    /* --ink @ 78% */
  color:#fff5da;                     /* 暖白，对比 5.4:1 ✓ AA */
  border:1px solid rgba(234,189,101,0.35);
  border-radius:14px;
  padding:8px 12px;
  min-width:102px;
  font-size:12px; line-height:1.45;
  box-shadow:0 4px 14px #0c1f1a40;
  backdrop-filter:blur(6px) saturate(1.15);
  -webkit-backdrop-filter:blur(6px) saturate(1.15);
  text-align:center;
}
.seat strong{ display:block; font-size:14px; color:#fff7e0; margin-bottom:2px; }
.seat span{  display:block; color:#e7d9b5; font-size:11px; }
.seat em{    display:block; font-style:normal; font-size:10.5px; color:#c9b48a; margin-top:2px; }
```

对比度自检: 文字 `#fff5da` 与 `rgba(37,73,61,0.78)` over cream wall `#f2e8d0` ≈ 等效底 `#4a6c5e` → **5.4:1** ✓ AA 正文
                     与 over 深绿绒 `#1F6F5C` ≈ 等效底 `#2f5547` → **8.2:1** ✓ AAA

---

## 4. `.watermark` / `.table-message` / `.table-cards` / `.room-label` 去留与落位

| 元素 | 决策 | 新位置与样式 |
|---|---|---|
| `.watermark` | **删除** | —— |
| `.felt` | **删除**（替换为 `.felt-played`，见 §2.1） | 仅承载 .table-cards |
| `.table-cards` | 保留并居中于 `.felt-played` 内 | 居中、横向、gap:6px；不溢出椭圆 |
| `.table-message` | **保留，重定位** | 见下 |
| `.room-label` | **保留，微调** | 见下 |

### 4.1 `.table-message` 新位置

**默认 (≥951px)**: 顶部居中条幅，落在窗框上沿（v 2%–6%），永不被裁：
```
.table-message{
  position:absolute;
  left:50%; top:3%;
  transform:translateX(-50%);
  max-width:60%;
  padding:8px 18px;
  background:rgba(37,73,61,0.85);
  color:#fff5da;
  border:1px solid rgba(234,189,101,0.4);
  border-radius:18px;
  font-size:13.5px; line-height:1.5;
  text-align:center;
  box-shadow:0 4px 14px #0c1f1a40;
  backdrop-filter:blur(4px);
}
```

**≤560px**: 退到顶部卡条下方（top:74px），缩为单行 + 字号 11.5px。

**为何不放桌面中央**: 与 §1 桌面不可遮挡冲突；且桌面中央归出牌堆。

### 4.2 `.room-label` 微调

```
.room-label{
  position:absolute;
  left:16px; bottom:14px;            /* 移至左下，避免与左上北卡争位 */
  color:#fff5da;
  font-size:10px; letter-spacing:2px;
  background:rgba(37,73,61,0.7);
  padding:6px 12px;
  border-radius:999px;
  border:1px solid rgba(234,189,101,0.3);
  backdrop-filter:blur(4px);
}
```

注意: 在宽屏默认布局下，左下 `bottom:14px left:16px` 与西位 `.west` 名片（`bottom:80px left:16px`）不冲突；在 ≤560px 默认卡条布局下，`left:8px; top:42px` 与顶部卡条错开。

---

## 5. 无障碍（WCAG AA）

### 5.1 文本对比度（已逐条测算于 §2.2 / §3.5）

| 前景 | 等效背景 | 对比度 | 等级 |
|---|---|---|---|
| `.tiny` 深字 `#1f2e26` | `#fff5da` | 12.4:1 | AAA |
| `.tiny.red` `#b94742` | `#fff5da` | 5.1:1 | AA |
| `.seat` 文字 `#fff5da` | 墙 #4a6c5e | 5.4:1 | AA |
| `.seat` 文字 `#fff5da` | 绿绒 #2f5547 | 8.2:1 | AAA |
| `.table-message` `#fff5da` | 自身底 `rgba(37,73,61,0.85)` over 墙 | ~7:1 | AAA |

### 5.2 第二重提示（不得仅靠颜色）

`.seat.active` 仅靠金色 `--gold` 描边传达信息 → 不达标。**叠加三重视觉/语义提示**：

```
.seat.active{
  /* 视觉层 */
  box-shadow:0 0 0 3px var(--gold), 0 0 0 5px #254b40, 0 6px 18px #0c1f1a55;
  background:rgba(37,73,61,0.88);
  /* 语义层: 角标 chip */
}
.seat.active::after{
  content:"轮到";          /* 默认提示文案 */
  position:absolute;
  top:-10px; right:-6px;
  padding:3px 7px;
  background:var(--gold);
  color:#254b40;
  font-size:10px; font-weight:600;
  border-radius:10px;
  letter-spacing:1px;
  box-shadow:0 2px 4px #00000040;
}
/* 出牌回合被叫"不要"或等待时，角标切为 "等待" */
.seat.active.idle::after{ content:"等待"; background:#cbbfa6; color:#254b40; }
```

第二重视觉: **金色描边 + 深绿外环 + "轮到/等待"文字角标**。文字本身非颜色依赖 → 视障玩家通过屏幕阅读仍能听到 "轮到 小禾"。
第三重视觉: 在 `.table-message` 中同步高亮当前发言者姓名（现有 `app.js` 已输出 `names[game.top.seat]`/`names[game.turn]`）。

### 5.3 焦点态（保留现有，不变）

```
button:focus-visible, a:focus-visible, select:focus-visible,
.seat:focus-visible, [tabindex]:focus-visible{
  outline:3px solid #d88c24;
  outline-offset:3px;
}
```
为 `.seat` 显式加 `tabindex="0"` 与 `aria-label="<昵称> · <名次/余牌> · <动向>"`，让键盘 Tab 可达。

### 5.4 减少动效

保留现有 `@media (prefers-reduced-motion:reduce){*{transition:none!important}}`，并把 `.seat.active` 的外环去掉脉冲呼吸（如未来加入），避免眩晕。

---

## 6. 验收清单（逐条勾选）

> 供主理人与 quality-lead 验收；本轮不写代码，先以这份作为可执行判据。

#### A. 图片安全
- [ ] A1. 1536×1024 图原样使用，未修改、未压缩、未二次裁切
- [ ] A2. `.felt` 绿色实心椭圆已删除；桌面纹理 100% 由原图贡献
- [ ] A3. 四个角色面部与上身未被任何 UI 像素覆盖（截图比对）
- [ ] A4. 牌桌实木环与虚线圈清晰可见，未被假边框覆盖

#### B. UI 落点
- [ ] B1. 默认布局（≥951px）四张名片分别在四象限角落
- [ ] B2. 默认布局 `.table-message` 落在 v 2%–6% 顶部条幅区
- [ ] B3. `.room-label` 默认在左下角（与 `.west` 不重叠）
- [ ] B4. 出牌堆中心化在桌面椭圆内，未超出虚线圈
- [ ] B5. ≤560px 切换为顶部四卡条，消息条退至 top:74px
- [ ] B6. ≤950px 与 ≤560px 切换过渡平滑，无溢出容器

#### C. cover 鲁棒性
- [ ] C1. 1440×900 桌面: 顶/底 6% 范围内无关键信息
- [ ] C2. iPad 横 1180×820: 同上
- [ ] C3. iPad 竖 820×1180: 左/右 12% 范围内无关键信息
- [ ] C4. iPhone 14 Pro 横 852×390: 顶/底 8% 范围内无关键信息
- [ ] C5. iPhone 14 Pro 竖 393×852: 左/右 12% 范围内无关键信息，顶部卡条四等分

#### D. 可读性
- [ ] D1. `.tiny` 在桌面绿绒最深区（#1F6F5C）仍可读，中心区域 scrim 暗化 ≤ 30%
- [ ] D2. 红桃/方块/大王红字对比 ≥ 4.5:1（用 axe-core 或 DevTools）
- [ ] D3. `.seat` 文字对比 ≥ 4.5:1
- [ ] D4. `.table-message` 在两种落点上对比 ≥ 4.5:1

#### E. 无障碍
- [ ] E1. `.seat.active` 同时具备: 金色描边 + 深绿外环 + "轮到/等待"角标
- [ ] E2. `.seat` 有 `aria-label` 与 `tabindex="0"`，键盘 Tab 可达
- [ ] E3. 焦点态 outline 为 `#d88c24` 3px solid + offset 3px
- [ ] E4. `prefers-reduced-motion: reduce` 下无脉冲/缩放动效
- [ ] E5. axe-core 自动扫描 0 critical / 0 serious

#### F. 一致性
- [ ] F1. 名片/消息条/角标全部使用 `--ink`/`--gold`/`--cream` 变量与已锁定色板
- [ ] F2. 无 emoji；字体仅 PingFang SC / Songti SC / Georgia
- [ ] F3. 圆角节奏统一: 名片 14px / 消息条 18px / 角标 10px / room-label 999px
- [ ] F4. 与 `.aside` 侧栏视觉重量平衡（侧栏字号 12px，名片基线 12px）

#### G. 性能
- [ ] G1. 仅使用 CSS `backdrop-filter`，不引入 JS
- [ ] G2. `.tiny` 无 box-shadow 数量爆炸（≤6 牌）
- [ ] G3. 未新增资源请求，PNG 仍为唯一一张图

---

## 附录 A: 给工程-lead 的实现清单

> 实现方可逐条对位到 `index.html` 的修改:

1. 删除 `.felt` 规则（含 950 / 560 媒体查询内的 `.felt` 覆盖）
2. 新增 `.felt-played` 规则（§2.1）
3. 改写 `.seat` 基础样式（§3.5）+ 四象限定位（§3.2）+ 950 / 560 重排（§3.3 / §3.4）
4. 新增 `.seat.active::after` 与 `.seat.active.idle::after`（§5.2）
5. 改写 `.table-message` 定位与样式（§4.1）
6. 改写 `.room-label` 定位（左下）+ 玻璃化（§4.2）
7. 删除 `.watermark` 规则与 `<div class="watermark">GINA CLUB</div>`
8. `.tiny` 改用 `#fff5da / #1f2e26`（§2.2），`.tiny.red` 保持 `#b94742`
9. 给 `.seat` 加 `tabindex="0"` 与 `aria-label`，并在 `app.js render()` 同步设置 `aria-label` 文案
10. 在 `app.js render()` 切换 `.seat.active.idle`（基于 `game.phase==='play' && last.pass`）

---

## 附录 B: 风险与未决问题

1. **`backdrop-filter` 在 Safari iOS 的兼容性**: iOS Safari 17+ 完全支持 `-webkit-backdrop-filter`。若需覆盖更老机型，需提供降级为纯色 `rgba(37,73,61,0.88)` 的方案。
2. **iPad 竖屏**（容器比 < 1）下图片左右裁: 桌面中央 v 34%–78% 区内的任何 UI（如有"接风提示"）都需走顶部条幅，不能落桌面。请文策渊确认是否有更多动态提示需求都走 `.table-message`。
3. **`.tiny` 数量**: 8 张牌同时出（如炸弹、同花顺）时是否需要缩放或换行？建议在 `.table-cards` 增加 `flex-wrap:wrap; max-width:50%;` 让牌堆自然换行。
4. **金钉播报节奏**: 当前 `.table-message` 文案由 `app.js` 在每个 phase 切换时写入；如未来加入"打 A 警告""双下通报"等更长文案，顶部条幅 `max-width:60%` 可能不够，请预留 `max-width:75%` 的媒体查询档（≤560）。
5. **南位"双下/二游"等敏感标识**: 当前代码在 `place>1 && double` 时把"三游/末游"显示为"双下"，可能造成误读（双下指两人同垫底，不是名次）。本轮不改逻辑，但建议文策渊在文案规范里确认显示策略。