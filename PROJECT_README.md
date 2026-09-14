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

房主创建房间后使用服务端返回的房主席位身份；其他三位玩家通过房间号或邀请链接入座；四人到齐后由房主开局。房间密码、观战权限、踢人和房主转让均由服务端鉴权。

## 修改规则

修改功能前先检查 `git status` 和 `docs/VERSION_INDEX.md`。完成后运行类型检查、单元测试和生产构建，再提交到 `main`。不要直接修改 `dist/`、`node_modules/` 或 `.manus-logs/`。
