# GINA 牌友会 · TODO

> 上次调试：2026-09-23  
> 线上地址：https://guandan-party-room.pages.dev（Cloudflare Pages 自动部署，关联 GitHub `gitanamomo/guandan-party-room`，分支 `main`）  
> 本地启动：`node server.cjs` → `http://127.0.0.1:8769`

---

## ✅ 已完成（本期）

- [x] **国风背景音乐 BGM**：复古竹笛古筝国风电音（`assets/bgm.mp3`，1.8MB），循环播放，音量 0.35
- [x] **BGM 默认开启**：改为 `!== 'false'` 判断，新用户进入首次点击即自动播放，不再默认静音
- [x] **双场景切换**：暖阳会所（现代）/ 雅轩茶社（中古茶韵），两页面均可切换，偏好持久化至 `localStorage`
- [x] **暖阳会所场景图加速**：原始 2.4MB PNG 转换为 497KB JPEG（`guandan-club-v2.jpg`），加载速度提升 ~4x
- [x] **server.cjs MIME 补全**：添加 `audio/mpeg`（`.mp3`）与 `image/jpeg`（`.jpg/.jpeg`）支持
- [x] **两页面同步**：`index.html` / `app.js`（单机练习页）和 `room.html` / `room.js`（联机房间页）均已同步上述所有功能
- [x] **全套测试验收**：23 项规则 + 14 项联机接口 + 6 项真实 HTTP = 全部通过，已推送 GitHub

---

## 🔧 待调试 / 下次继续

### 高优先级

- [ ] **Safari / iOS 真机 BGM 验证**  
  iOS Safari 对 Web Audio 有额外限制，需真机验证首次点击后能否正常触发 `<audio>.play()`；若不行需考虑用 AudioContext 解锁方案

- [ ] **移动端场景切换体验**  
  窄屏（390px）时顶部导航栏按钮会否折叠或被截断，待 iPhone 真机验证；必要时把场景切换按钮收进汉堡菜单

- [ ] **BGM 在联机时的跨标签页问题**  
  多标签页打开时多个 `<audio>` 实例会同时播放，可考虑 BroadcastChannel 协调只有最前台标签页播放

### 中优先级

- [ ] **自定义 BGM 支持**  
  提供一个「换个曲子」按钮，内置 2-3 首国风风格备选；或允许本地文件拖入（File API）

- [ ] **声效与背景音乐分离控制**  
  当前「声音：关」（打牌音效）与「音乐：开/关」（BGM）是独立两个按钮，用户可能混淆；考虑合并为一个面板统一管理

- [ ] **场景图预加载**  
  雅轩茶社背景图（844KB）首次点击切换时仍有短暂白屏，可在页面加载时用 `<link rel="preload">` 预取

- [ ] **雅轩茶社场景升级**  
  当前使用 AI 生成图（2026-09-23），可考虑进一步提炼提示词生成更精致的版本；参考提示词见 `assets/guandan-club-v2.prompt.txt`

### 低优先级 / 下一个功能

- [ ] **首页「选场景」大屏展示**  
  当前场景切换仅在游戏桌面内切换背景；可考虑首页（或进入游戏前）做一个视觉更强的场景选择画面

- [ ] **斗地主游戏**（复用房间/音效框架）

- [ ] **麻将游戏**（复用同一套架构）

- [ ] **AI 代打质量提升**（当前为基础启发式，容易乱出）

---

## 🐛 已知问题

| 问题 | 状态 | 说明 |
|------|------|------|
| Safari/iOS BGM 可能不播 | ⚠️ 未验证 | iOS 需要 `AudioContext.resume()` 在用户手势内调用 |
| Cloudflare Pages 首次部署约 1 分钟延迟 | ℹ️ 正常 | 推送后等待自动 CI/CD 完成即可 |
| BGM `.mp3` 在极旧版浏览器不支持 | ℹ️ 可忽略 | 现代浏览器全部支持 |

---

## 📦 关键文件速查

| 文件 | 作用 |
|------|------|
| `index.html` | 单机练习页（含 CSS / HTML 结构） |
| `app.js` | 单机练习逻辑：选牌、渲染、BGM、场景切换 |
| `room.html` | 多人联机房间页（含 CSS / HTML 结构） |
| `room.js` | 多人联机逻辑：WebRTC P2P / HTTP 模式、BGM、场景切换 |
| `engine.js` | 规则与赛制引擎（Browser + Node 共用） |
| `server.cjs` | 本地局域网服务器 |
| `netlify/functions/api.js` | 线上 Netlify Functions 房间接口 |
| `assets/bgm.mp3` | 国风背景音乐（竹笛古筝电音，1.8MB） |
| `assets/guandan-club-v2.jpg` | 现代暖阳会所场景（497KB，主用） |
| `assets/guandan-club-v2.png` | 同上原始 PNG（2.4MB，备用） |
| `assets/guandan-teahouse.jpg` | 中古雅轩茶社场景（844KB） |
| `tests/rules.test.cjs` | 规则测试 23 项 |
| `tests/netlify-api.test.cjs` | 线上接口回归测试 14 项 |
| `tests/live-server.test.cjs` | 真实 HTTP 集成测试 6 项 |
| `build.js` | 一键构建验证：语法 + 配置 + 所有测试 |

---

## 🛠 调试常用命令

```sh
# 启动本地服务
node server.cjs

# 全套验证（推送前跑）
CI=1 node build.js

# 单独语法检查
node --check app.js && node --check room.js

# 推送到 GitHub（Cloudflare Pages 自动部署）
git add -A && git commit -m "描述" && git push origin main
```
