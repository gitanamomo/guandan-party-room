# 掼蛋小院项目维护说明

## 当前唯一运行入口

请以当前 Git 分支 `main` 的根目录源码为准。启动、检查和构建命令均在本目录执行：

```bash
pnpm dev
pnpm check
pnpm test
pnpm build
```

## 版本管理

历史版本不复制成多个源码文件夹，而是使用 Git 提交和标签保存。版本索引见 [`docs/VERSION_INDEX.md`](docs/VERSION_INDEX.md)。

## 资料位置

验收记录、设计建议和资源说明在 `docs/records/`；一次性演示/数据种子脚本在 `scripts/archive/`，不要把归档脚本当作当前业务逻辑读取或执行。当前四人在线回归脚本是 `scripts/verify_four_player_online.ts`。

## 当前核心链路

房主创建房间后使用服务端返回的 `hostGuestId`；其他三位玩家通过房间号或邀请链接入座；四人到齐后由房主开局。房间密码、观战权限、踢人和房主转让均由服务端鉴权。

## 互动动画与音效

牌桌当前包含以下反馈：出牌时中央牌桌会产生脉冲光圈，已出的牌会以轻微弹入动画出现，轮到某位玩家时其头像会持续轻轻浮动，贴纸会从右上角漂浮淡出。玩家点击选牌、出牌、过牌、聊天、发送贴纸、入座和开局时，会触发浏览器原生 Web Audio 的短提示音；方言报牌、进贡还牌、战报和古筝背景音乐仍使用 `/manus-storage/` 下的正式音频资源。所有动画都遵守 `prefers-reduced-motion`，用户关闭方言音效后，短提示音也会一并静音。

## 由用户自行部署到 Vercel

1. 在 GitHub 仓库 `gitanamomo/guandan-party-room` 的 `main` 分支确认最新代码已经推送。
2. 打开 Vercel，进入项目 `guandan-party-room`，选择 **Settings → Environment Variables**。
3. 新增变量 `DATABASE_URL`，值使用当前 WebDev 项目对应的 MySQL/TiDB 连接字符串；环境至少勾选 **Production**，建议同时勾选 **Preview** 和 **Development**。不要把连接字符串提交到 Git，也不要写入 `.env` 并推送。
4. 进入 **Deployments**，选择最新部署右侧菜单的 **Redeploy**；如果项目已连接 GitHub，也可以向 `main` 推送一个新提交触发自动部署。
5. 部署完成后打开生产域名，依次验证主页、`/api/trpc/auth.me`、房主创建房间、三位玩家入座和房主开局。未登录访问 `auth.me` 返回 `null` 属于正常结果；创建房间返回 `Database offline` 则说明 `DATABASE_URL` 尚未注入到当前部署环境。

当前 Vercel 项目使用 `vercel.json` 将 `/api/*` 重写到 `api/index.ts`，构建脚本会生成自包含的 `dist/vercel-app.js`，因此不要删除 `api/` 入口或把 `dist/` 加入部署忽略规则。

## 修改规则

修改功能前先检查 `git status` 和 `docs/VERSION_INDEX.md`。完成后运行类型检查、单元测试和生产构建，再提交到 `main`。不要直接修改 `dist/`、`node_modules/` 或 `.manus-logs/`。
