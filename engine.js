/* Shared deterministic Guandan rules; no DOM or private-information AI. */
(function(root){
'use strict';
const ranks=Array.from({length:13},(_,i)=>i+2), suits=['♠','♥','♣','♦'];
const label=r=>({11:'J',12:'Q',13:'K',14:'A',16:'小王',17:'大王'}[r]||String(r));
const power=(r,l)=>r>=16?r+1:r===l?15:r;
const wild=(c,l)=>c.r===l&&c.s==='♥';
function deck(){let d=[];for(let k=0;k<2;k++){for(const r of ranks)for(const s of suits)d.push({id:`${k}-${s}-${r}`,r,s});for(const r of [16,17])d.push({id:`${k}-J-${r}`,r,s:'王'});}return d;}
function patterns(l){let p=[];const add=(type,rs,score,tier=0,s=null)=>p.push({type,rs,score,tier,s,key:`${type}:${rs.join(',')}:${s||''}`,n:rs.length});
for(const r of [...ranks,16,17]){add('单张',[r],power(r,l));add('对子',[r,r],power(r,l));if(r<16){add('三张',[r,r,r],power(r,l));for(let n=4;n<=10;n++)add('炸弹',Array(n).fill(r),power(r,l),n<=5?n:n+1);for(const q of [...ranks,16,17])if(q!==r)add('三带二',[r,r,r,q,q],power(r,l));}}
for(const [type,len,mul] of [['顺子',5,1],['三连对',3,2],['钢板',2,3]])for(let start=1;start<=15-len;start++){let rs=Array.from({length:len},(_,i)=>start+i===1?14:start+i).flatMap(r=>Array(mul).fill(r));add(type,rs,start+len-1);if(type==='顺子')for(const s of suits)add('同花顺',rs,start+len-1,6,s);}
add('四王炸',[16,16,17,17],99,20);return p;}
const cache=new Map();function pats(l){if(!cache.has(l))cache.set(l,patterns(l));return cache.get(l);}
// Natural cards fill slots first; only unresolved non-joker slots may use wild cards.
function fit(hand,p,l){if(p.n===1)return hand.find(c=>c.r===p.rs[0])?[hand.find(c=>c.r===p.rs[0])]:null;
let pool=hand.filter(c=>!wild(c,l)),ws=hand.filter(c=>wild(c,l)),chosen=[],missing=[];
for(const r of p.rs){let i=pool.findIndex(c=>c.r===r&&(!p.s||c.s===p.s));if(i>=0)chosen.push(pool.splice(i,1)[0]);else missing.push(r);}
if(missing.some(r=>r>=16)||missing.length>ws.length)return null;return chosen.concat(ws.slice(0,missing.length));}
function beats(a,b){if(!b)return true;if(a.tier||b.tier)return a.tier>b.tier||(a.tier===b.tier&&a.score>b.score);return a.type===b.type&&a.n===b.n&&a.score>b.score;}
function classify(cards,l){if(!cards.length||new Set(cards.map(c=>c.id)).size!==cards.length)return [];return pats(l).filter(p=>p.n===cards.length&&fit(cards,p,l));}
function moves(hand,l,top){let out=[];for(const p of pats(l)){if(!beats(p,top))continue;const cs=fit(hand,p,l);if(cs)out.push({p,cards:cs});}return out;}
function sort(hand,l){return hand.sort((a,b)=>power(b.r,l)-power(a.r,l)||suits.indexOf(a.s)-suits.indexOf(b.s)||a.id.localeCompare(b.id));}
function newGame(random=Math.random){const g={levels:[2,2],aFails:[0,0],level:2,round:0,history:[],random};deal(g);return g;}
function log(g,s){g.history.push(s);if(g.history.length>100)g.history.shift();}
function deal(g){if(g.champion!==undefined)throw Error('本场已结束，请新开一场');let d=deck();for(let i=d.length-1;i>0;i--){let j=Math.floor(g.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}g.hands=[[],[],[],[]];d.forEach((c,i)=>g.hands[i%4].push(c));g.round++;g.finished=[];g.top=null;g.passed=[];g.discard=[];g.phase='play';g.last=[null,null,null,null];g.returns=[];
if(!g.previous){const eligible=d.filter(c=>c.r<16&&!wild(c,g.level));const card=eligible[Math.floor(g.random()*eligible.length)];g.turn=g.hands.findIndex(h=>h.some(c=>c.id===card.id));log(g,`翻明牌 ${card.s}${label(card.r)}，${g.turn+1}号先出`);}else tribute(g);g.hands.forEach(h=>sort(h,g.level));}
function tribute(g){const order=g.previous,first=order[0],double=first%2===order[1]%2;let donors=double?order.slice(2):[order[3]];if(donors.flatMap(i=>g.hands[i]).filter(c=>c.r===17).length===2){g.turn=first;log(g,'两张大王抗贡，头游领出');return;}
let gifts=donors.map(from=>({from,card:sort(g.hands[from].filter(c=>!wild(c,g.level)),g.level)[0]}));gifts.sort((a,b)=>power(b.card.r,g.level)-power(a.card.r,g.level));if(double&&power(gifts[0].card.r,g.level)===power(gifts[1].card.r,g.level))gifts.sort((a,b)=>(a.from===(first+1)%4?-1:1));
g.turn=gifts[0].from;gifts.forEach((x,i)=>{let to=order[i];g.hands[x.from]=g.hands[x.from].filter(c=>c.id!==x.card.id);g.hands[to].push(x.card);g.returns.push({from:to,to:x.from});log(g,`${x.from+1}号向${to+1}号进贡 ${x.card.s}${label(x.card.r)}`);});g.phase='return';}
function returnChoices(g,seat){let h=g.hands[seat];let low=h.filter(c=>power(c.r,g.level)<=10);if(low.length)return low;let min=Math.min(...h.map(c=>power(c.r,g.level)));return h.filter(c=>power(c.r,g.level)===min);}
function giveBack(g,seat,id){let req=g.returns.find(x=>x.from===seat);if(g.phase!=='return'||!req)throw Error('当前无需还贡');let c=returnChoices(g,seat).find(c=>c.id===id);if(!c)throw Error('请还不大于10的非级牌；没有时还最小牌');g.hands[seat]=g.hands[seat].filter(x=>x.id!==id);g.hands[req.to].push(c);sort(g.hands[req.to],g.level);g.returns=g.returns.filter(x=>x!==req);log(g,`${seat+1}号还给${req.to+1}号 ${c.s}${label(c.r)}`);if(!g.returns.length)g.phase='play';}
function next(g,seat){for(let i=1;i<=4;i++){let n=(seat+i)%4;if(g.hands[n].length)return n;}throw Error('没有可出牌玩家');}
function settle(g){const f=g.finished;if(f.length===2&&f[0]%2===f[1]%2){g.finished=f.concat([0,1,2,3].filter(i=>!f.includes(i)));}else if(f.length===3)g.finished=f.concat([0,1,2,3].find(i=>!f.includes(i)));else return;
const order=g.finished,team=order[0]%2,place=order.indexOf((order[0]+2)%4),up=4-place;
g.previous=order.slice();g.phase='over';g.result={team,up,order:order.slice(),double:place===1};
// Only the team whose level is being played is making an A attempt.
const playing=g.playingTeam;if(g.level===14&&playing!==undefined){if(team===playing&&place<3)g.champion=team;else {g.aFails[playing]++;if(g.aFails[playing]===3){g.levels[playing]=2;g.aFails[playing]=0;}}}
if(g.champion===undefined){if(!(g.level===14&&team===playing&&g.levels[team]===2))g.levels[team]=Math.min(14,g.levels[team]+up);g.level=g.levels[team];g.playingTeam=team;}
log(g,`${team===0?'青松队':'暖阳队'}获胜，升${up}级${g.champion!==undefined?'，成功过A！':''}`);}
function act(g,seat,ids,key){if(g.phase!=='play'||g.turn!==seat)throw Error('还没轮到你出牌');if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('牌张重复');
if(!ids.length){if(!g.top)throw Error('领出不能过牌');g.passed.push(seat);g.last[seat]={pass:true};log(g,`${seat+1}号不要`);let pending=[0,1,2,3].filter(i=>g.hands[i].length&&i!==g.top.seat&&!g.passed.includes(i));if(!pending.length){let winner=g.top.seat;g.turn=g.hands[winner].length?winner:(winner+2)%4;if(!g.hands[g.turn].length)g.turn=next(g,winner);log(g,g.hands[winner].length?`${g.turn+1}号重新领出`:`${g.turn+1}号接风`);g.top=null;g.passed=[];g.last=[null,null,null,null];}else g.turn=next(g,seat);return;}
let cards=ids.map(id=>g.hands[seat].find(c=>c.id===id));if(cards.some(c=>!c))throw Error('只能出自己持有的牌');let options=classify(cards,g.level).filter(p=>beats(p,g.top?.p));let p=key?options.find(p=>p.key===key):options[0];if(!p)throw Error('牌型不合法，或未压过桌上的牌');g.hands[seat]=g.hands[seat].filter(c=>!ids.includes(c.id));g.discard.push(...cards);g.top={seat,p,cards};g.last[seat]={p,cards};g.passed=[];log(g,`${seat+1}号：${p.type}（${label(p.rs[0])}）`);if(!g.hands[seat].length){g.finished.push(seat);log(g,`${seat+1}号成为第${g.finished.length}游`);settle(g);if(g.phase==='over')return;}g.turn=next(g,seat);}
function bot(g,seat){if(g.phase==='return'){let cs=returnChoices(g,seat);return giveBack(g,seat,cs[cs.length-1].id);}let ms=moves(g.hands[seat],g.level,g.top?.p);let finish=ms.find(m=>m.cards.length===g.hands[seat].length);if(finish)return act(g,seat,finish.cards.map(c=>c.id),finish.p.key);if(g.top&&g.top.seat%2===seat%2)return act(g,seat,[]);ms.sort((a,b)=>a.p.tier-b.p.tier||(g.top?0:b.cards.length-a.cards.length)||a.p.score-b.p.score);let m=ms[0];act(g,seat,m?m.cards.map(c=>c.id):[],m?.p.key);}
const api={deck,label,power,wild,patterns,classify,beats,moves,sort,newGame,deal,act,bot,giveBack,returnChoices,settle,tribute};if(typeof module!=='undefined')module.exports=api;root.GD=api;
})(typeof globalThis!=='undefined'?globalThis:this);
