#!/usr/bin/env bash
# GINA 牌友会 · 一键部署到指定 Netlify 账号
#
# 用法：
#   NETLIFY_AUTH_TOKEN=你的令牌 ./deploy.sh
#   ./deploy.sh 你的令牌                 # 也可以直接当参数传
#   ACCOUNT_SLUG=gitanamo ./deploy.sh    # 指定团队 slug（多团队时用）
#
# 说明：
#   - 只读取/写入本项目目录内的文件（配置和缓存放在 ./.home），不动系统目录
#   - 先把 build.js 的校验跑一遍（语法 + 配置 + 39 项测试），失败即中止
#   - 站点不存在则创建；名字被占用（Netlify 域名全局唯一）会自动换备选名
#   - 部署完自动做一次线上冒烟测试：建房 → 加入 → 四席准备 → 校验 108 张
set -euo pipefail
cd "$(dirname "$0")"

TOKEN="${NETLIFY_AUTH_TOKEN:-${1:-}}"
if [ -z "$TOKEN" ]; then
  echo "❌ 缺少 Access Token。用法：NETLIFY_AUTH_TOKEN=xxx ./deploy.sh"
  exit 1
fi

# CLI 的配置目录放到项目内，避免写入工作区外的目录
export HOME="$PWD/.home"
export NETLIFY_AUTH_TOKEN="$TOKEN"
mkdir -p "$HOME"

CLI="npx --no-install netlify"
API="https://api.netlify.com/api/v1"
api() { curl -s -m 25 -H "Authorization: Bearer $TOKEN" "$@"; }

echo "① 校验构建：语法 + 配置 + 全部测试"
node build.js >/dev/null
echo "   ✅ 构建校验通过"

echo "② 确认目标账号"
if [ -z "${ACCOUNT_SLUG:-}" ]; then
  ACCOUNT_SLUG=$(api "$API/accounts" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{const a=JSON.parse(s);
    if(!a.length){console.error('令牌没有可用团队');process.exit(1);}
    if(a.length>1)console.error('检测到多个团队，将使用第一个：'+a.map(t=>t.slug).join(', '));
    console.log(a[0].slug);
  }catch(e){console.error('无法读取团队：'+s.slice(0,200));process.exit(1)}
});")
fi
echo "   目标团队 slug：$ACCOUNT_SLUG"

echo "③ 创建或复用站点"
PRIMARY="${SITE_NAME:-gina-guandan-club}"
CANDIDATES="$PRIMARY ${PRIMARY}-room ${PRIMARY}-online gina-paoyouhui"
SITE_NAME=""

# 先看账号里是否已有同名（或同前缀）站点，避免每次部署都多建一个站点
EXISTING=$(api "$API/sites?per_page=100" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{const a=JSON.parse(s);const want=process.argv[1];
    const hit=a.find(x=>x.name===want)||a.find(x=>x.name.startsWith(want+' -'))||a.find(x=>x.name.startsWith(want));
    if(hit)console.log(hit.name);
  }catch(e){}
});" "$PRIMARY")
if [ -n "$EXISTING" ]; then
  SITE_NAME="$EXISTING"
  echo "   复用已有站点：$SITE_NAME"
fi

for name in $CANDIDATES; do
  [ -n "$SITE_NAME" ] && break
  echo "   尝试站点名：$name"
  if $CLI sites:create --name "$name" --account-slug "$ACCOUNT_SLUG" >/tmp/gd-create.log 2>&1; then
    SITE_NAME="$name"; break
  fi
  if grep -qiE "already (exists|taken)|not available|unique" /tmp/gd-create.log; then
    echo "     ↳ 名字已被占用，换下一个"
    continue
  fi
  # 名字之外的原因（比如额度/权限）——直接报出来，不要静默换名
  echo "     ↳ 创建失败："
  sed 's/^/       /' /tmp/gd-create.log | head -8
  exit 1
done

if [ -z "$SITE_NAME" ]; then
  echo "❌ 备选站点名都被占用，请用 SITE_NAME=xxx ./deploy.sh 指定一个"
  exit 1
fi
echo "   使用站点：$SITE_NAME"

# 取站点 ID 与真实地址：Netlify 可能给子域名加后缀（全局唯一），不能靠拼名字猜
SITE_JSON=$(api "$API/sites?per_page=100" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const want=process.argv[1];
  try{const a=JSON.parse(s);
    const hit=a.find(x=>x.name===want)||a.find(x=>x.name.startsWith(want));
    if(hit){console.log(JSON.stringify({id:hit.id,url:hit.ssl_url||hit.url}));}
  }catch(e){}
});" "$SITE_NAME")
SITE_ID=$(echo "$SITE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).id)}catch{console.log('')}})")
URL=$(echo "$SITE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).url)}catch{console.log('')}})")
if [ -z "$SITE_ID" ]; then
  echo "❌ 无法取得站点 ID，请检查令牌权限"
  exit 1
fi
echo "   站点 ID：$SITE_ID"
echo "   站点地址：$URL"

echo "④ 部署到生产环境"
$CLI deploy --prod --site "$SITE_ID"

echo "⑤ 线上冒烟测试"
cd /tmp && SITE_URL="$URL" node <<'EOF'
const B = process.env.SITE_URL;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const req = async (p, { method='GET', body, token } = {}) => {
  const res = await fetch(B + p, { method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  let j = {}; try { j = await res.json(); } catch {}
  return { status: res.status, ...j };
};
(async () => {
  for (const p of ['/index.html', '/room.html', '/app.js', '/engine.js', '/assets/guandan-club-v2.png']) {
    const r = await fetch(B + p);
    if (!r.ok) throw new Error(`${p} 返回 ${r.status}`);
    console.log(`   ✅ ${p} ${r.status}`);
  }
  const owner = await req('/api/create', { method: 'POST', body: { name: '房主', password: 'gina' } });
  if (!owner.ok) throw new Error('建房失败：' + owner.error);
  console.log(`   ✅ 线上建房成功，房间号 ${owner.state.code}（空座 ${owner.state.players.filter(p=>p===null).length}）`);

  const code = owner.state.code;
  const tokens = [owner.token];
  for (const i of [1,2,3]) {
    // 与真实客户端一致：Netlify Blobs 写入后要几秒才可读，这里同样重试
    let j = null;
    const deadline = Date.now() + 25000;
    for (;;) {
      j = await req('/api/join', { method: 'POST', body: { name: '玩家'+i, code, password: 'gina' } });
      if (j.ok) break;
      if (!/房间不存在/.test(j.error || '') || Date.now() >= deadline) {
        throw new Error(`加入失败：${j.error}`);
      }
      await sleep(1200);
    }
    tokens.push(j.token);
  }
  console.log('   ✅ 四人入座');
  // 四人「同时」点准备：这正是旧实现丢更新的场景，必须仍然能开局
  // 与真实客户端一致：会话暂时失效时重试（Blobs 传播延迟）
  const readyOne = async t => {
    const ddl = Date.now() + 20000;
    for (;;) {
      const r = await req('/api/action', { method: 'POST', body: { type:'ready', ready:true, code }, token: t });
      if (r.ok || !/会话无效/.test(r.error || '') || Date.now() >= ddl) return r;
      await sleep(1200);
    }
  };
  const readyRes = await Promise.all(tokens.map(readyOne));
  const bad = readyRes.filter(r => !r.ok);
  if (bad.length) throw new Error('准备失败：' + bad[0].error);
  console.log('   ✅ 四人同时准备（并发写）全部成功');
  // 会话可能因传播延迟暂时解析不出座位，像客户端一样重试
  const stateOf = async t => {
    const ddl = Date.now() + 20000;
    for (;;) {
      const r = await req('/api/state?code=' + encodeURIComponent(code), { token: t });
      if (r.ok || !/会话无效/.test(r.error || '') || Date.now() >= ddl) return r;
      await sleep(1200);
    }
  };
  // 四席准备后服务端才发牌，且 Blobs 有传播延迟：像客户端一样轮询等牌局出现
  let states = null;
  const ddl = Date.now() + 30000;
  for (;;) {
    states = [];
    let all = true;
    for (const t of tokens) {
      // 房主每轮都读一次：服务端正是在房主的这次读取里触发发牌
      const s = await stateOf(t);
      if (!s.ok) throw new Error('读取状态失败：' + s.error);
      if (!s.state.game) { all = false; break; }
      states.push(s.state);
    }
    if (!all && states.length === 0) { /* 继续轮询 */ }
    if (all) break;
    if (Date.now() >= ddl) throw new Error('等待发牌超时（牌局未出现）');
    await sleep(1000);
  }
  const seen = new Set();
  for (const st of states) {
    if (st.game.hand.length !== 27) throw new Error('手牌数不是 27，实际 ' + st.game.hand.length);
    for (const c of st.game.hand) {
      if (seen.has(c.id)) throw new Error('手牌泄漏：' + c.id);
      seen.add(c.id);
    }
  }
  if (seen.size !== 108) throw new Error('四家合计不是 108 张，实际 ' + seen.size);
  console.log('   ✅ 四席发牌正确：每人 27 张，合计 108 张且不重复');
})();
EOF

echo
echo "🎉 部署完成：$URL"
echo "   房间页（发给其他三人）：$URL/room.html"
