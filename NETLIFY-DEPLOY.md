# 🚀 Netlify 部署与线上联机说明

- **Netlify 控制台**：https://app.netlify.com/projects/guandan-party-room/overview
- **线上地址**：https://guandan-party-room.netlify.app/
- **当前版本**：1.1.0（线上四人房间可玩）

## 线上怎么玩

1. 打开线上地址 → 首页是本机练习（1 人对 3 电脑），右上角有「四人联机房间 ↗」。
2. 房主进房间页 → 填名字 → 点「创建房间」，页面会显示一个 6 位房间号。
3. 把地址和自己看到的房间号发给其他三位。
4. 其他三人打开同一地址 → 填名字 + 房间号 → 点「加入房间」。
5. 四人都点「准备」后自动发牌；每副结束由房主点「下一副」。

口令固定为 `gina`（界面已预填）。异地、不同 Wi-Fi 都可以，**不需要任何一台电脑常开**。

## 线上架构

| 部分 | 实现 |
| --- | --- |
| 静态页面 | Netlify 静态托管（`publish = "."`） |
| 房间接口 | `netlify/functions/api.js`，路由 `/api/*` |
| 房间状态 | Netlify Blobs（`gina-guandan-rooms`），无需数据库 |
| 规则引擎 | 根目录 `engine.js`，函数通过 `require('../../engine.js')` 复用 |

服务端是权威的：只给每个会话下发自己的手牌，并校验座位、轮次、持牌与牌型。

`netlify.toml` 里 `included_files = ["engine.js"]` 保证函数打包时带上规则引擎；
`node_bundler = "esbuild"` 负责打包依赖（`@netlify/blobs`）。

## 部署账号与额度（2026-09-12 实况）

旧账号（团队 **Gitana**，slug `gitanamomo`，Free）已触发 Netlify 的账号级封禁，
任何站点都无法再部署，API 返回的原文是：

```
{"error":"Account credit usage exceeded - new deploys are blocked until credits are added"}
```

这与代码无关，换站点、换项目都一样。要发布请任选其一：
充值恢复旧账号额度，或部署到另一个 Netlify 账号。

### 部署到指定账号（一条命令）

```bash
NETLIFY_AUTH_TOKEN=你的令牌 ./deploy.sh
# 多团队时指定：ACCOUNT_SLUG=xxx NETLIFY_AUTH_TOKEN=... ./deploy.sh
# 指定站点名：  SITE_NAME=xxx NETLIFY_AUTH_TOKEN=... ./deploy.sh
```

`deploy.sh` 会：校验构建（语法 + 配置 + 39 项测试）→ 确认团队 → 创建或复用站点
（名字被占用会自动换备选名，因为 Netlify 域名全局唯一）→ 部署到生产 → 跑线上冒烟测试
（建房 → 三人加入 → 四席准备 → 校验每人 27 张、合计 108 张不重复）。

它把 Netlify CLI 的配置目录放在项目内的 `./.home`，不写系统目录。

## 线上房间为什么这样写（重要）

Netlify Blobs 线上实测有三个必须绕开的特性，代码结构就是围绕它们设计的：

1. **最终一致性**：写入后 3~11 秒才可读（冷启动更久）；
2. **强一致性不可用**：该运行时上下文不含 `uncachedEdgeURL`，`consistency: 'strong'` 会直接报错；
3. **`list()` 列表滞后可达数十秒**：实测某房间 4 条认领只列出 1 条 —— 早期版本靠它判断「四席齐且都准备」，
   于是牌局一直开不了。现在**完全不调用 `list()`**。

因此存储按「一个键只有一个写者」划分：

| 键 | 写者 | 内容 |
| --- | --- | --- |
| `seat:<房间号>:<0..3>` | 该席位的玩家本人 | 名字、是否准备 |
| `token:<令牌>` | 该令牌持有者本人 | `{ code, seat }` |
| `room:<房间号>` | 当前该行动的人 / 开局的人 | 冻结名单、牌局 |

- 选座：座位 0 留给房主，其余按**令牌哈希**决定起点，写入后回读校验；抢到同一席时写输的一方换下一席。
- 被覆盖者：滞后视图会让后来者把先到者覆盖掉，因此会话解析失败时会**补占空席**；
  并有两条保护 —— 必须连续多次读到「自己不在座且确有空席」才动手，补占后再反向核对并让出多余席位；
  另外，同一令牌占两席时会**回收较后的那一席**，避免房间被虚假占满。
- 开局：任意玩家读到「四席齐且全部准备」即可把名单冻结进 `room`（整条写入是原子的），之后座位/手牌/轮次以名单为准。

对应的回归测试（`tests/netlify-api.test.cjs`）用**带传播延迟的 store** 复现这些竞态，
包括「并发准备丢更新」「并发加入抢座」「被覆盖后补回座位」——这些用例在旧实现下会失败。

## 关键部署注意事项


1. **不要加 `/* → /index.html` 的通配兜底重定向。**
   本项目 HTML 都是真实文件、没有前端路由；该兜底会让 `/room.html`、`/assets/*.png`、
   `/engine.js` 全部返回 `index.html`，房间页与背景图直接失效。`build.js` 会检测并让构建失败。
2. **`/api/*` 的重定向必须存在且排在前面**，否则接口 404，线上无法建房。
3. **函数读取房间时必须重新挂回 `game.random`。**
   `engine.js` 的 `deal()` 依赖 `g.random()` 洗牌，而 JSON 存进 Blobs 会丢掉函数，
   不还原则第二副必定抛 `g.random is not a function`。
4. **贡还阶段必须调用 `GD.giveBack()`**，不能走 `GD.act()`，否则报「还没轮到你出牌」，
   牌局会卡在还贡。
5. 构建命令是 `node build.js`：会做语法检查、配置校验并跑全部 39 项测试，失败即中断部署。

## 部署方式

### 自动（推荐）
推送到 GitHub 后，Netlify 会自动执行 `node build.js` 并发布。

### 手动
```bash
npm install
npm run build     # 本地先验证：语法 + 配置 + 39 项测试
npm run deploy    # netlify deploy --prod
```

## 本地对照

- 本机练习：直接打开 `index.html`
- 本地四人：`node server.cjs` → `http://127.0.0.1:8769`（换端口：`PORT=8799 node server.cjs`）
- 本地房间页与线上房间页是同一份 `room.html` + `room.js`：
  线上同源访问 `/api/*`，本地自动指向 `127.0.0.1:8769`。

## 验证记录（1.1.0）

- 语法检查：`app.js` / `engine.js` / `room.js` / `server.cjs` / `netlify/functions/api.js` 全部通过
- 规则测试 23 项通过（含 40 副固定种子自动牌局）
- 线上接口回归 10 项通过（内存 store，覆盖发牌、手牌隔离、第二副、重连、越权）
- 真实 HTTP 集成 6 项通过（真起 `server.cjs`，建房→三人加入→四席准备→每人 27 张）
- 尚未验证：Safari/iOS 真机、真人四台设备从打 2 完整打到过 A、实听音效
