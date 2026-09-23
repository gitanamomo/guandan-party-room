# GINA牌友会 - Netlify部署

## 项目概述
GINA牌友会是一个基于Web的掼蛋游戏项目，支持本地练习和多人在线游戏。

## 部署状态
- **项目地址**: https://app.netlify.com/projects/guandan-party-room/overview
- **当前版本**: v1.0.0
- **最后更新**: 2026-09-08

## 功能特性
- ✅ **完整的掼蛋游戏规则**
- ✅ **1名玩家 + 3名电脑的对战模式**
- ✅ **同Wi-Fi局域网多人游戏**
- ✅ **异地网络访问支持**
- ✅ **断线重连机制**
- ✅ **移动设备适配**
- ✅ **v2暖色会所美术风格**

## 部署配置
- **构建命令**: 静态部署
- **发布目录**: 根目录 `/`
- **Node.js版本**: 18+
- **自定义域名**: 可配置

## 文件结构
```
├── index.html          # 主游戏页面
├── room.html           # 房间页面
├── app.js              # 游戏逻辑
├── room.js             # 房间交互
├── engine.js           # 规则引擎
├── server.cjs          # 开发服务器
├── netlify.toml        # Netlify配置
├── package.json        # 项目配置
├── README.md           # 项目文档
└── netlify-README.md   # 部署说明
```

## 环境变量
项目支持以下环境变量：
- `NODE_VERSION`: Node.js运行时版本
- `PORT`: 服务器端口（默认8769）

## 访问说明
### 本地开发
1. 克隆项目
2. 运行 `npm install`
3. 执行 `npm start`
4. 访问 `http://localhost:8769`

### 在线部署
- **主页面**: https://guandan-party-room.netlify.app/
- **房间页面**: https://guandan-party-room.netlify.app/room.html

## 多人游戏说明
### 房主操作
1. 在本地运行 `node server.cjs`
2. 访问 `http://localhost:8769/room.html`
3. 创建房间，记下房间号

### 玩家加入
1. 访问 `http://服务器IP:8769/room.html`
2. 输入房间号和名字
3. 点击"加入房间"

### 异地访问
如果是异地访问，房主需要：
1. 获取公网IP地址
2. 告知玩家访问 `http://服务器IP:8769/room.html`
3. 玩家输入房间号即可加入

## 技术栈
- **前端**: 原生HTML/CSS/JavaScript
- **后端**: Node.js HTTP服务器
- **部署**: Netlify静态托管
- **开发**: VS Code/编辑器

## 注意事项
1. 本地开发时需要运行 `server.cjs`
2. 在线部署时仅支持静态页面访问
3. 多人游戏需要服务器支持（本地/自托管）
4. 生产环境建议使用HTTPS

## 更新日志
### v1.0.0 (2026-09-08)
- ✅ 完成核心掼蛋游戏功能
- ✅ 实现断线重连机制
- ✅ 支持异地网络访问
- ✅ 修复房间创建占座问题
- ✅ 更新Netlify部署配置

## 联系方式
- **项目主页**: https://app.netlify.com/projects/guandan-party-room/overview
- **技术支持**: 通过项目Issues提交

---

*此文档随项目更新自动同步*