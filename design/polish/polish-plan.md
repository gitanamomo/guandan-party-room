# 打磨轮次执行方案 / Polish Plan

日期：2026-09-09 · 阶段：**Phase 6 打磨**（Phase 5 制作收尾 → Phase 6 交接带）
用户已拍板的两项决策：**图当主角，UI 让位** / **先修结构，再上核心四动效**

---

## 1. 诊断结论

### 问题一「字挡住图片」——不是字号问题，是双层牌桌冲突
`assets/guandan-club-v2.png`（1536×1024）里**本来就有真牌桌与四个人物**，HTML 却又在其上盖了一整套 UI，共 5 层：

| z | 元素 | 遮挡贡献 |
|---|------|---------|
| 0 | 背景图（真牌桌 + 四人物） | 被遮挡方 |
| 1 | `.room:before` 全区域渐变遮罩 | 轻微 |
| 2 | `.felt` 实心绿色椭圆 `inset:128px 14% 74px` | **主要遮挡源**——赝品牌桌糊在真牌桌上 |
| 3 | `.seat` ×4 白卡（94% 不透明） | 压住人物 |
| 4 | `.watermark` / `.table-message` / `.table-cards` | 叠在赝品牌桌内 |
| 5 | `.room-label` 左上胶囊 | 轻微 |

### 问题二「没有动画」——不是没写，是结构上写不上去
全项目实测：`@keyframes` 0 处、`animation` 0 处、`requestAnimationFrame` 0 处、`transition` 仅 2 处。
根因是 `app.js` 的 `render()` 每次**全量重建 DOM**（`replaceChildren`），CSS 过渡依赖节点身份连续性，节点一销毁重建，动画就没有起始状态。

---

## 2. 已交付规格

| 文档 | 行数 | 归属 | 核心产出 |
|------|------|------|---------|
| `overlay-spec.md` | 425 | 美术指导 | 安全区划分、`.felt` 替代方案、座位卡四角落点、31 条验收判据 |
| `motion-spec.md` | 570 | 技术负责人 | 增量更新边界、四动效关键帧数值、性能与无障碍约束 |

---

## 3. 合并执行清单（按优先级）

### P0 · 遮挡修复（源 `overlay-spec.md` 附录 A）
1. 删除 `.felt` 实心椭圆规则与 `.watermark`
2. 新增 `.felt-played` 出牌托盘：中心 0% 透明、边缘 30% 暗化，原图绿绒与木环完整露出
3. `.seat` 改为四角落点：北→左上、东→右上、西→左下（`bottom:80px` 抬离椅腿）、南→右下
4. `.seat` 玻璃化：`rgba(37,73,61,0.78)` + `blur(6px) saturate(1.15)`，文字 `#fff5da`
5. `.table-message` 移至顶部 2%–6% 窗框留白带；`.room-label` 移至左下
6. `.tiny` 调整为 `#fff5da / #1f2e26`（对比度 12.4:1）
7. ≤950px / ≤560px 两档断点排布重写

### P0 · 结构改造（源 `motion-spec.md` §A）
8. `#hand` 手牌区改为 id-keyed 增量更新（**必改，最高价值**）
9. `.seat` ×4 改为子节点增量更新（约 10 行，最低成本最高收益）
10. `#table-cards` 加签名守卫 + 离场队列，**不做** keyed diff
11. `#history` / `#interpretation` / `#hint` / `#summary` **保持全量重建**（明确不改，避免过度工程）

### P0 · 核心四动效（源 §B，单个 ≤250ms）
12. 出牌飞入 · 13 轮转高亮 · 14 选牌抬升 · 15 过牌淡出

### P1 · 无障碍与既有缺陷
16. 补全 `prefers-reduced-motion` 对 `animation` 的覆盖（**必须写 `.01ms` 而非 `none`**，否则 `animationend` 不触发 → 节点泄漏）
17. `.seat.active` 增加第二重提示：金色描边 + 深绿外环 + 文字角标
18. 出牌后键盘焦点管理（`focus({preventScroll:true})`）
19. 8 张牌同时出的 `flex-wrap` + `max-width` 兜底

---

## 4. 交叉风险（主理人汇编时发现，两位成员均未串到）

| ID | 风险 | 缓解 |
|----|------|------|
| **R1** | `engine.js:8` 的 `deck()` **每副生成完全相同的 108 个 id**。`GD.deal()` 后增量更新会复用上一副的节点 → 错误飞入动画、残留 `aria-pressed`、级牌 badge 与新 level 不符 | **必须加 round epoch 守卫**：发新副时强制清空手牌 Map。这是本轮最隐蔽的坑，漏掉会表现为"偶发鬼牌" |
| **R2** | `.seat.north/.south` 的 `transform` 已被 `translateX(-50%)` 占用，轮转高亮不能动画 `.seat` 本体 | 动画挂 `::after`；`.seat.active` 现有 `box-shadow` 是 paint 属性，逐帧重绘会掉帧 |
| **R3** | `animation:none!important` 会让 `animationend` 永不触发，离场节点回收失效 | reduced-motion 写 `.01ms`，选择器含 `*::after` |
| **R4** | iOS 旧机型 `backdrop-filter` 兼容 | 同时提供纯色降级 `rgba(37,73,61,0.88)` |
| **R5** | 手牌 `margin-right:-25px` 重叠布局，抬起的那张被右侧邻居压住（既有缺陷） | 新增 `z-index:2` |

---

## 5. 主理人裁定（技术负责人提出的两处等价替换，均予采纳）

- **B3 选中态 `border:2px` → `inset box-shadow`**：视觉像素级一致，但消除每次选牌的布局重排，符合"只动合成属性"约束。
- **B3 新增 `z-index:2`**：修复 R5 既有视觉缺陷，非新增需求。
- **`.seat.active` 角标用独立 `<span>`**，不占用 `::after`，避免与 R2 的轮转动画争伪元素。

---

## 6. 改动范围与影响面

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `index.html` | CSS 为主 | 删除 `.felt`/`.watermark`，新增 `.felt-played`，重写 `.seat` 定位与两档断点 |
| `app.js` | `render()` 重构 | 手牌与座位改为增量更新，加 round epoch 守卫，挂四动效 |
| `engine.js` | **不动** | 规则引擎保持不变（R1 在 `app.js` 侧加守卫解决） |
| `server.cjs` / `room.*` | **不动** | 联机版本轮不涉及 |

**备份位置**：`.workbuddy/snapshots/2026-09-09-pre-polish/`（index.html / app.js / room.html / room.js / engine.js，已于 20:49 完成）

---

## 7. 验收门禁

代码改动完成后，派 严守真 `quality-lead` 执行：
- 覆盖层 31 条判据（overlay-spec §6）
- 动效结构/性能/无障碍/行为保持四组判据（motion-spec §F）
- 补充 R1 专项：连续 5 副发牌，检查无残留节点、无错位 badge、无错误飞入

门禁判定为 PASS 后，本轮打磨结项。
