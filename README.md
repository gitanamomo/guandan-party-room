# GINA 牌友会 · 掼蛋与宠物斗地主

> 纯前端棋牌游戏：掼蛋单机 / 四人联机、斗地主三人单机练习；新增 PetVerse 拟人宠物森光会所模板。
> 无第三方框架，无构建工具，打开即玩。

![暖阳会所场景](assets/guandan-club-v2.jpg)

**🌐 在线体验**：https://guandan-party-room.pages.dev  
**📋 口令**：`gina`  
**📦 仓库**：https://github.com/gitanamomo/guandan-party-room

---

## v1.5.0 · 森光会所视觉重建（2026-11-08）

按用户确认的「精致 3D 动画电影感」重做画面。先审核旧版构图，再制作拟人角色与完整场景，最后落地并逐屏验收。

- **拟人角色**：四足贴图改为穿衣、坐椅、用爪持牌的宠物角色；保留 PetVerse 品种特征。
- **匹配视角**：掼蛋四席与斗地主三席分别构图，角色、桌面、椅子、光照和接触阴影统一。
- **四张正式美术**：每个玩法各有横版、竖版，手机端使用专门构图，保留全部角色。
- **统一游戏界面**：顶部比分、完整场景、纸牌、操作条连成整体；绒面、木纹、纸牌厚度、选中抬升和按钮质感同步升级。
- **动态状态**：行动标记、地主身份、已走完、余牌与结算由真实牌局状态显示；长牌型在手机安全区域内排版。
- **保留旧版**：v1.4 位于 Git 提交 `64935d3`；旧素材不覆盖，经典会所/茶社仍可切换。

[审核与规划](docs/visual-v15/PLAN.md) · [改动及验收](docs/visual-v15/README.md) · [美术与提示词](docs/visual-v15/PROMPTS.md)

## v1.4.0（2026-11-08）新增

- **宠物花园模板**：顶部「🐾 宠物花园」同时切换主角和场景，复用 PetVerse 橘猫、贵宾犬、斯芬克斯猫、法斗；掼蛋单机、联机与斗地主共享主题偏好。新访客默认宠物模板，已有场景偏好保留。
- **斗地主**：顶部「♠ 斗地主 · 三人练习」进入 `doudizhu.html`，你对两位电脑。支持叫分、底牌、完整本桌牌型、提示、过牌、结算与再来一局；具体变体见页面「本桌规则」。本次斗地主为单机模式，掼蛋继续支持四人联机。
- **环境**：轻量 SVG 宠物花园，绿色绒面桌、木地板、爪印与绿植。原暖阳会所和雅轩茶社仍可切换。
- **服务与验证**：补齐 CSS / SVG MIME；新增斗地主规则与整局测试、静态资源检查。详见 [验收记录](docs/verification-2026-11-08/README.md)。

## 🎮 快速开始

### 本机单人练习（无需服务器）

```
双击 index.html 或用浏览器打开
```

- 掼蛋：你与三位电脑牌友自动开桌，从打 2 开始
- 斗地主：打开 `doudizhu.html`，等待你叫分或出牌；点击「提示」选牌，再点「出牌」
- 点牌选中 → 出牌 / 不要；提示按钮可自动推荐
- 百搭牌型在下拉框中选择声明
- 轮到还贡时选一张小牌确认

### 在线四人联机（异地也能玩）

1. 打开线上地址或首页右上角「四人在线联机对战 ↗」
2. **房主**：填名字 → 创建房间 → 把链接或房间号发给朋友
3. **其他人**：打开同一地址，填名字 + 房间号 → 加入房间
4. 四人各点一次「准备」，自动发牌

### 本地局域网模式

```sh
node server.cjs          # 默认端口 8769
# 或：PORT=8899 node server.cjs
```

访问 `http://127.0.0.1:8769` 开始，其他人用同 Wi-Fi 下的主机 IP 加入。

---

## 🎵 背景音乐 & 场景

顶部导航栏提供两项视觉与听觉体验设置：

| 控件 | 功能 |
|------|------|
| `森光宠物会所` / `🏙️ 暖阳会所` / `🍵 雅轩茶社` | 切换正式拟人宠物场景或原有经典背景 |
| `🎵 音乐：开/关` | 开关国风竹笛古筝背景音乐 |

- 音乐**默认开启**，首次点击页面（出牌、选牌等）即自动播放
- 风格偏好自动保存，刷新后保持上次选择

---

## 📁 项目结构

```
掼蛋棋牌室/
├── index.html                   # 单机练习页
├── app.js                       # 单机逻辑：渲染、选牌、BGM、场景
├── engine.js                    # 掼蛋规则引擎（浏览器 & Node 共用）
├── doudizhu.html / .css / .js    # 斗地主页面、样式与交互
├── doudizhu-engine.js            # 独立斗地主规则引擎
├── pet-theme.css / .js          # 三页面共享的宠物模板与场景切换
├── assets/cinema/                # 四张正式拟人场景及来源说明
├── docs/visual-v15/              # 视觉审核、计划、提示词、验收截图
├── tests/visual-states.cjs        # 选牌、长牌型、结算的专项视觉检查
├── assets/pets/                  # 原 PetVerse 立绘与身份参考
├── assets/pet-garden.svg         # 轻量花园场景
├── tests/doudizhu.test.cjs        # 斗地主规则与80局自动对局
├── docs/verification-2026-11-08/  # 本次验收记录和截图
├── room.html                    # 联机房间页
├── room.js                      # 联机逻辑：WebRTC P2P、BGM、场景
├── server.cjs                   # 本地局域网服务器
├── build.js                     # 构建验证脚本
├── netlify/functions/api.js     # 线上 Netlify Functions 接口
├── netlify.toml                 # Netlify 路由配置
├── tests/
│   ├── rules.test.cjs           # 规则边界测试（23 项）
│   ├── netlify-api.test.cjs     # 联机接口回归测试（14 项）
│   └── live-server.test.cjs    # 真实 HTTP 集成测试（7 项）
├── assets/
│   ├── bgm.mp3                  # 国风背景音乐（竹笛古筝电音，1.8MB）
│   ├── guandan-club-v2.jpg      # 现代暖阳会所场景（497KB，主用）
│   ├── guandan-club-v2.png      # 同上原始 PNG（2.4MB，备用）
│   ├── guandan-club-v2.prompt.txt # 原始 AI 生成提示词
│   └── guandan-teahouse.jpg     # 中古雅轩茶社场景（844KB）
├── RULES.md                     # 规则版本、地方差异说明
├── PLAN.md                      # 项目分期与后续计划
├── TODO.md                      # 调试进度与待办事项
└── versions/                    # 历史美术版本备份
```

---

## 🧪 开发与验证

```sh
# 全套构建验证（语法 + 配置 + 所有测试，推送前必跑）
CI=1 node build.js

# 单独语法检查
node --check app.js && node --check room.js && node --check engine.js
node --check doudizhu-engine.js && node --check doudizhu.js && node --check pet-theme.js

# 测试覆盖：共 54 项
node tests/doudizhu.test.cjs       # 10 项，含80局电脑对局
node tests/rules.test.cjs          # 23 项规则测试
node tests/netlify-api.test.cjs    # 14 项联机接口回归
node tests/live-server.test.cjs    # 7 项真实 HTTP 集成
```

**测试覆盖说明：**
- 规则测试：108 张牌唯一性、百搭边界、同花顺、炸弹优先级、升级赛制、贡还流程、固定种子 40 副全自动对局
- 联机测试：四席开局、手牌不外泄、断线重连、并发安全、服务端权威出牌校验
- HTTP 测试：所有静态资源正确返回（含 `.jpg`、`.mp3` MIME 类型）

---

## 📋 版本历史

### v1.3.2（2026-09-23）
- 场景图由 2.4MB PNG 改为 497KB JPEG，加载速度提升 ~4x
- BGM 改为默认开启，首次点击即播放（不再需要手动打开）
- `server.cjs` 补全 `.mp3` / `.jpg` MIME 类型

### v1.3.1（2026-09-23）
- 新增国风背景音乐（竹笛古筝电音，1.8MB，`assets/bgm.mp3`）
- 新增双场景切换：现代暖阳会所 / 中古雅轩茶社（`assets/guandan-teahouse.jpg`）
- 单机与联机两个页面均同步场景切换与音乐控制

### v1.3.0（2026-09-23）
- WebRTC P2P 直连架构（PeerJS），零成本公网对战
- 联机页完整复刻 v2 暖色会所美术
- 15 秒超时 AI 智能代打，防止一人卡桌
- 移动端滑动连续选牌

### v1.2.0（历史）
- 修复 Netlify Blobs 竞态问题（并发准备、并发加入、重连不重复占座）

### v1.1.0（历史）
- 修复 `app.js` 语法错误（注释吞掉闭合括号）、`netlify.toml` 通配兜底问题
- 修复第二副必崩溃（`random` 函数序列化丢失）
- 修复多人还贡无法完成

### v1.0（2026-09-08）
- 本机单机可玩（你 vs 三电脑）
- 完整掼蛋规则引擎、升级赛制、贡还流程
- 23 项规则测试 + 40 副自动对局全部通过

---

## ⚙️ 配置

| 项目 | 值 |
|------|-----|
| 入场口令 | `gina` |
| 本地端口 | `8769`（`PORT` 环境变量可覆盖） |
| 房间号格式 | 4 位大写字母，自动生成 |
| BGM 默认 | 开启（`localStorage.ginaBgmOn`，仅存 `'false'` 时静音） |
| 场景默认 | 森光宠物会所（`localStorage.ginaScene`：`pets` / `modern` / `teahouse`） |

---

## 🔒 安全说明

- 服务端权威验证：出牌由服务端核查持牌、轮次、牌型合法性
- 每个会话只能收到自己的手牌
- 口令尝试限速（8 次/分钟）
- 房间状态仅返回各玩家有权看到的信息

---

## 📈 后续计划

参见 [TODO.md](TODO.md) 获取详细调试待办事项。

主要方向：
- 🔜 Safari / iOS 真机 BGM 验证与修复
- 🔜 场景图预加载（消除首次切换白屏）
- 🔜 斗地主三人联网（当前已提供单机三人练习）
- 🔜 麻将游戏

---

## 修改指南

- 场景原图与身份参考：见 `assets/cinema/README.md`，提示词在 `docs/visual-v15/PROMPTS.md`。替换时新增版本文件名，保留旧版。
- 共用视觉：`pet-theme.css` 按界面、状态牌、动态牌区、纸牌、移动端分段；三/四人及横/竖版场景在 `.room.theme-pets` 规则中切换。
- 控制器：`pet-theme.js` 的 `apply(scene)` 管主题；`decorate()` 标注座位、纸牌及长牌型。不要将页面级 `data-scene` 与 `button[data-scene]` 的按钮选择器混用。
- 斗地主：`doudizhu.css` 只保留结构基础，正式视觉统一在 `pet-theme.css`，避免两套座位定位覆盖。
- 状态：`app.js` / `room.js` / `doudizhu.js` 标注真实完成、入座和地主身份；规则仍在各自引擎中。
- 复查：`npm test`、`CI=1 node build.js`；浏览器可执行 `tests/browser-smoke.cjs` 和 `tests/visual-states.cjs`（需 Playwright / Chromium、启动本地 8778 端口）。
- 必须人工打开桌面、手机、选牌、长牌型和结算截图审核。自动测试通过不能代替美术验收。
- 纯静态页面支持 GitHub Pages 子路径；掼蛋联机使用原有 PeerJS / HTTP 服务。Safari / iPhone 真机与远程部署应单独验收。

*最后更新：2026-11-08 | v1.5.0 | GINA 牌友会*
