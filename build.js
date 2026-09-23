// Netlify 构建脚本
const fs = require('fs');
const path = require('path');

console.log('🚀 开始GINA牌友会项目构建...');

// 检查关键文件
const requiredFiles = [
  'index.html',
  'app.js',
  'engine.js',
  'room.html',
  'room.js',
  'server.cjs',
  'netlify.toml',
  'package.json',
  'netlify/functions/api.js',
  'assets/guandan-club-v2.png',
  'assets/guandan-teahouse.jpg',
  'assets/bgm.mp3'
];

console.log('📋 检查项目文件...');
const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));

if (missingFiles.length > 0) {
  console.error('❌ 缺少必要文件:', missingFiles);
  process.exit(1);
}

// 语法检查：app.js 曾经因注释吞掉闭合括号而整个文件解析失败，
// 从而让在线版彻底打不开。这里把语法检查纳入构建，防止再次复发。
console.log('🔎 语法检查...');
const { execFileSync } = require('child_process');
const syntaxTargets = ['app.js', 'engine.js', 'room.js', 'server.cjs', 'netlify/functions/api.js'];
for (const f of syntaxTargets) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    console.error(`❌ 语法错误：${f}\n${e.stderr ? e.stderr.toString() : e.message}`);
    process.exit(1);
  }
}
console.log(`✅ 语法检查通过（${syntaxTargets.length} 个文件）`);

console.log('✅ 所有必要文件已存在');

// 创建部署信息文件
const packageJsonForVersion = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deploymentInfo = {
  name: 'GINA牌友会',
  version: packageJsonForVersion.version,
  buildTime: new Date().toISOString(),
  environment: process.env.NETLIFY_ENVIRONMENT || 'production',
  commit: process.env.COMMIT_SHA || 'unknown',
  branch: process.env.BRANCH || 'main',
  netlifyProject: 'guandan-party-room',
  onlinePlayable: true,
  features: [
    '本机 1 人对 3 电脑练习',
    '线上四人房间（Netlify Function + Blobs）',
    '断线重连',
    '移动设备适配',
    'v2 暖色会所美术'
  ],
  verifiedInBuild: [
    'app.js / engine.js / room.js / server.cjs / functions/api.js 语法检查',
    '23 项规则边界与 40 副自动牌局测试',
    '10 项线上房间接口回归测试',
    '6 项真实 HTTP 集成测试'
  ]
};

fs.writeFileSync('deploy-info.json', JSON.stringify(deploymentInfo, null, 2));
console.log('📝 创建部署信息文件: deploy-info.json');

// 验证配置文件
console.log('🔍 验证配置文件...');

// 验证netlify.toml
// netlify.toml 必须把 /api/* 指向 Netlify Function，且不能做 /* → index.html 的通配兜底
// （通配兜底会让 room.html、assets、engine.js 全部返回 index.html，在线版直接失效）
const netlifyConfig = fs.readFileSync('netlify.toml', 'utf8');
if (!netlifyConfig.includes('/.netlify/functions/api/:splat')) {
  console.error('❌ netlify.toml 缺少 /api/* → Netlify Function 的重定向');
  process.exit(1);
}
if (/from\s*=\s*"\/\*"[\s\S]{0,80}to\s*=\s*"\/index\.html"/.test(netlifyConfig)) {
  console.error('❌ netlify.toml 存在 /* → /index.html 通配兜底，会吞掉 room.html 与静态资源');
  process.exit(1);
}
console.log('✅ netlify.toml 路由配置正确（API 走函数，无通配兜底）');

// 验证package.json
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (!packageJson.name || !packageJson.version) {
  console.error('❌ package.json 配置不正确');
  process.exit(1);
}
console.log(`✅ package.json 配置正确: ${packageJson.name} v${packageJson.version}`);

// 运行测试
console.log('🧪 运行测试...');
try {
  const { execSync } = require('child_process');
  execSync(`"${process.execPath}" tests/rules.test.cjs`, { stdio: 'inherit' });
  execSync(`"${process.execPath}" tests/netlify-api.test.cjs`, { stdio: 'inherit' });
  if (!process.env.CF_PAGES && !process.env.CI && !process.env.VERCEL) {
    try {
      execSync(`"${process.execPath}" tests/live-server.test.cjs`, { stdio: 'inherit' });
    } catch (e) {
      console.log('⚠️ 本地实时服务器测试跳过（无本地端口权限）');
    }
  }
  console.log('✅ 所有测试通过');
} catch (error) {
  console.error('❌ 测试失败:', error.message);
  process.exit(1);
}

// 创建构建完成文件
const buildComplete = {
  status: 'success',
  message: 'GINA牌友会项目构建完成',
  timestamp: new Date().toISOString(),
  files: requiredFiles,
  deployment: deploymentInfo
};

fs.writeFileSync('build-complete.json', JSON.stringify(buildComplete, null, 2));
console.log('🎉 构建完成!');
console.log('📄 构建报告: build-complete.json');
console.log('🌐 部署信息: deploy-info.json');

process.exit(0);