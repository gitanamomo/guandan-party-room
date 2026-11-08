# v1.4.0 验收记录 · 2026-11-08

## 改动范围

| 文件/位置 | 变更原因 |
|---|---|
| `index.html`、`room.html` 顶部导航与脚本入口 | 增加宠物模板和斗地主入口 |
| `app.js`、`room.js` 原场景切换段 | 删除重复场景绑定，交给共享控制器；原掼蛋规则不变 |
| `pet-theme.js`、`pet-theme.css` | 统一三页的主题、场景标签、宠物立绘、偏好保存及移动布局 |
| `assets/pets/`、`assets/pet-garden.svg` | 复用四只 PetVerse 宠物，新增轻量花园环境 |
| `doudizhu.html/.css/.js`、`doudizhu-engine.js` | 三人单机斗地主：叫分、合法牌型、AI、提示、结算 |
| `server.cjs` 静态资源响应 | 增加 `text/css` / `image/svg+xml` |
| `tests/doudizhu.test.cjs`、`tests/live-server.test.cjs`、`tests/browser-smoke.cjs` | 验证规则、HTTP 资源、桌面及手机宽度交互 |
| `build.js`、`package.json`、`package-lock.json` | 版本 1.4.0，新文件检查和测试纳入构建 |
| `README.md`、`TODO.md` | 更新玩法范围、结构、运行方式、修改指南及后续验收 |

共享主题入口：`pet-theme.js` 的 `apply(scene)`；场景偏好仍使用 `localStorage.ginaScene`。例如：

```js
room.classList.toggle('theme-pets', scene === 'pets');
```

## 自动检查

- 斗地主：10 项，含固定种子 80 局自动叫分/对局，覆盖牌张守恒、提示合法、角色胜负、春天和零和计分。
- 掼蛋：原有 23 项，含 40 副电脑对局。
- Netlify API：原有 14 项接口回归。
- HTTP：7 项，含新增 CSS / SVG MIME、图片和斗地主页面资源、完整四人掼蛋发牌。
- 共 54 项；另有 JavaScript 语法检查、`git diff --check` 和 `CI=1 node build.js`。

HTTP 测试最初在受限沙箱中因无法监听端口失败；允许临时本机端口后 7 项全部通过。

## 浏览器验收

在本地 Chromium、1440×1050 和 390×844 视口下分别验证：

- 新访客默认宠物模板；三个主题切换，刷新与跨页保存。
- 四只掼蛋宠物与三只斗地主宠物素材加载正常。
- 斗地主叫分、提示选牌、出牌、规则弹窗、整局结束、得分、再来一局。
- 联机页面的主题切换，不改变原有房间协议。
- 页面无横向溢出；无未捕获脚本错误或缺失的本地资源。

截图：

- [掼蛋桌面](guandan-1440.png) / [掼蛋手机宽度](guandan-390.png)
- [斗地主桌面](doudizhu-1440.png) / [斗地主手机宽度](doudizhu-390.png)

可复跑的浏览器脚本：`tests/browser-smoke.cjs`。需要 Playwright 和 Chromium，并先在项目目录以 `PORT=8778 node server.cjs` 启动服务。可通过 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定已安装的 Chromium。

## 验证边界

- 手机宽度测试使用 Chromium 模拟视口；macOS Safari / iPhone 真机未验收。
- 斗地主本次为三人单机练习；三人联网是后续工作。
- 原有掼蛋联机已做接口回归，本次没有进行异地四人 WebRTC 实战。
- GitHub 同步和远程站点部署属于后续发布步骤，不能由本地测试推断成功。
