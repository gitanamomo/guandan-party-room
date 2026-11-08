# v1.5 · 森光会所视觉审核与验收

## 审核与结果

| v1.4 问题 | v1.5 改动 | 验收依据 |
|---|---|---|
| 四足立绘贴在信息卡上，缺少打牌姿态 | 穿衣、坐椅、爪持牌的拟人角色，统一置于场景 | 三/四人正式场景与实际页面截图 |
| 桌椅、角色、环境透视和光照不一致 | 统一相机、材质、遮挡与接触阴影 | 横/竖版逐图人工审核 |
| 三人斗地主沿用四人画面 | 单独的三人三席环境 | 斗地主横/竖场景均为三只宠物 |
| 手机把四席排成头像横栏 | 专用竖版构图，状态牌对应真实角色 | 390px 四席/三席完整保留 |
| 页面像多个分离的信息面板 | 比分、场景、纸牌、操作区合为统一牌桌 | 实际网页截图 |
| 材质扁平、纸牌与环境脱节 | 绒面、木纹、针织、毛发、纸张厚度和金色选中 | 场景和选牌状态截图 |
| 状态信息靠随意位置的标签表达 | 真实余牌、行动权、地主、完成状态和结算 | 浏览器专项断言及截图 |

## 文件改动

- `assets/cinema/`：四张正式生成场景、用途和源文件说明。
- `pet-theme.css`：统一界面、座位锚点、牌面材质和横竖适配。
- `pet-theme.js`：主题、三/四人区分、统一牌桌结构、动态牌型排版。
- `doudizhu.css`：清除重复的旧座位规则，保留结构基础，消除手机状态牌遮挡。
- `app.js` / `room.js` / `doudizhu.js`：为已有状态补充展示标注，斗地主增加行动角标。规则引擎未改。
- 三个 HTML：更新视觉文案；保留游戏和原有经典场景入口。
- `build.js`、版本文件、HTTP 测试：将四张场景纳入检查，版本 1.5.0。
- `tests/browser-smoke.cjs`、`tests/visual-states.cjs`：实际对局与专项视觉检查。
- README / TODO / PLAN / PROMPTS：记录审核、规划、实现、运行与修改指南。

共享实现示例：

```js
room.dataset.longPlay = String(played > 14);
```

`pet-theme.css` 的长牌型规则只压缩桌面已出的牌，选牌区保持正常可点击尺寸。

## 已执行检查

- `CI=1 node build.js`：资源、8 个 JavaScript 语法、10 项斗地主、23 项掼蛋、14 项接口检查通过。
- `node tests/live-server.test.cjs`：7 项通过，包含四张新场景资源和原四人发牌流程。
- `tests/browser-smoke.cjs`：1440px / 390px 的主题切换、跨页与刷新偏好、斗地主叫分/提示/出牌/整局/结算/再开，以及联机页主题通过；无脚本错误、本地资源缺失或页面横向溢出。
- `tests/visual-states.cjs`：1440px / 390px 的选牌、20 张飞机带单展示、结算无行动角标、掼蛋选牌通过。20 张牌截图为明确构造的呈现测试样本，不用作合法完整对局证据。
- 人工打开桌面、手机、选中、长牌型及结算截图，复核角色数、视角、标签遮挡、牌面清晰度。
- `git diff --check` 和最终改动脚本语法检查通过。

初轮人工截图发现斗地主手机状态牌异常遮挡，未按自动测试通过直接交付；已清理旧版重复布局与合成效果，并复跑对局和专项画面检查，最终截图正常。

## 实际界面截图

| 状态 | 桌面 | 手机宽度 |
|---|---|---|
| 掼蛋 | [1440](verification/guandan-1440.png) | [390](verification/guandan-390.png) |
| 斗地主出牌 | [1440](verification/doudizhu-1440.png) | [390](verification/doudizhu-390.png) |
| 斗地主选牌 | [1440](verification/selected-1440.png) | [390](verification/selected-390.png) |
| 长牌型呈现样本 | [1440](verification/long-play-fixture-1440.png) | [390](verification/long-play-fixture-390.png) |
| 结算 | [1440](verification/result-1440.png) | [390](verification/result-390.png) |
| 掼蛋选牌 | [1440](verification/guandan-selected-1440.png) | [390](verification/guandan-selected-390.png) |

## 运行与边界

直接打开 `index.html` / `doudizhu.html`，或 `node server.cjs` 后访问相应页面。浏览器脚本需 Playwright 与 Chromium，先启动 8778 服务；专项脚本支持 `TEST_BASE` 指定其他地址。

- 本轮采用高质量 3D 风格静态场景插画；牌局 UI 动态渲染，没有引入实时 3D 引擎或逐帧角色动作。
- 手机验证是 Chromium 视口模拟；Safari / iPhone 真机、异地四人 WebRTC 实战尚未复验。
- 2026-11-08 用户已确认提交并推送 v1.5；远程站点部署状态需单独核验。
