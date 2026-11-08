/* 斗地主固定规则：单副牌、轮流叫分、无癞子；规则与 DOM 分离。 */
(function(root){
'use strict';
const label=r=>({11:'J',12:'Q',13:'K',14:'A',15:'2',16:'小王',17:'大王'}[r]||String(r));
function deck(){const d=[];for(let r=3;r<=15;r++)for(const s of ['♠','♥','♣','♦'])d.push({id:s+r,r,s});for(const r of [16,17])d.push({id:'J'+r,r,s:'王'});return d;}
const sort=h=>h.sort((a,b)=>b.r-a.r||a.id.localeCompare(b.id));
function classify(cs){if(!cs.length||new Set(cs.map(c=>c.id)).size!==cs.length)return null;const counts=new Map();cs.forEach(c=>counts.set(c.r,(counts.get(c.r)||0)+1));const rs=[...counts.keys()].sort((a,b)=>a-b),n=cs.length;
 const p=(type,score,tier=0)=>({type,score,n,tier});const seq=ks=>ks[ks.length-1]<=14&&ks.every((r,i)=>!i||r===ks[i-1]+1);
 if(n===2&&rs[0]===16&&rs[1]===17)return p('王炸',17,2);
 if(rs.length===1){if(n===4)return p('炸弹',rs[0],1);return n<=3?p(['','单张','对子','三张'][n],rs[0]):null;}
 const triple=rs.find(r=>counts.get(r)===3);
 if(triple&&n===4)return p('三带一',triple);
 if(triple&&n===5&&rs.length===2)return p('三带二',triple);
 if(n>=5&&rs.length===n&&seq(rs))return p('顺子',rs.at(-1));
 if(n>=6&&n%2===0&&rs.length===n/2&&rs.every(r=>counts.get(r)===2)&&seq(rs))return p('连对',rs.at(-1));
 for(const mode of [3,4,5]){const k=n/mode;if(!Number.isInteger(k)||k<2)continue;
  for(let start=3;start+k-1<=14;start++){
   const core=Array.from({length:k},(_,i)=>start+i);if(!core.every(r=>counts.get(r)>=3))continue;
   const rest=new Map(counts);core.forEach(r=>{const c=rest.get(r)-3;if(c)rest.set(r,c);else rest.delete(r);});
   // 单翅使用互异点数，不能拆四张作飞机主体，也不允许双王作翅。
   if(mode===3&&!rest.size||mode===4&&rest.size===k&&[...rest.values()].every(v=>v===1)&&!core.some(r=>rest.has(r))&&!(rest.has(16)&&rest.has(17))||mode===5&&rest.size===k&&[...rest.values()].every(v=>v===2)&&!core.some(r=>rest.has(r)))return p(mode===3?'飞机':mode===4?'飞机带单':'飞机带对',start+k-1);
  }
 }
 const four=rs.find(r=>counts.get(r)===4);
 if(four&&n===6)return p('四带二',four);
 if(four&&n===8&&rs.length===3&&rs.filter(r=>r!==four).every(r=>counts.get(r)===2))return p('四带两对',four);
 return null;
}
function beats(a,b){return !!a&&(!b||a.tier>b.tier||a.tier===b.tier&&(a.tier>0||a.type===b.type&&a.n===b.n)&&a.score>b.score);}
function choose(xs,k,visit,start=0,out=[]){if(!k){visit(out);return;}for(let i=start;i<=xs.length-k;i++)choose(xs,k-1,visit,i+1,out.concat([xs[i]]));}
function moves(hand,top){const groups=new Map();hand.forEach(c=>{if(!groups.has(c.r))groups.set(c.r,[]);groups.get(c.r).push(c);});const out=[],seen=new Set();
 function add(cs){const key=cs.map(c=>c.id).sort().join('|');if(seen.has(key))return;seen.add(key);const p=classify(cs);if(beats(p,top))out.push({cards:cs,p});}
 function attach(core,count,pairs=false){const used=new Set(core.map(c=>c.r));const remaining=hand.filter(c=>!used.has(c.r));if(pairs){const gs=[...groups].filter(([r,cs])=>!used.has(r)&&cs.length>=2).map(([,cs])=>cs.slice(0,2));choose(gs,count,x=>add(core.concat(x.flat())));}else choose(remaining,count,x=>add(core.concat(x)));}
 for(const [,cs]of groups){for(let n=1;n<=cs.length;n++)add(cs.slice(0,n));if(cs.length>=3){attach(cs.slice(0,3),1);attach(cs.slice(0,3),1,true);}if(cs.length===4){attach(cs,2);attach(cs,2,true);}}
 if(groups.has(16)&&groups.has(17))add([groups.get(16)[0],groups.get(17)[0]]);
 for(const mul of [1,2,3])for(let start=3;start<=14;start++){let core=[];for(let end=start;end<=14&&groups.get(end)?.length>=mul;end++){core=core.concat(groups.get(end).slice(0,mul));const len=end-start+1;if(len>=(mul===1?5:mul===2?3:2)){add(core);if(mul===3){attach(core,len);attach(core,len,true);}}}}
 return out.sort((a,b)=>a.p.tier-b.p.tier||(top?0:b.cards.length-a.cards.length)||a.p.score-b.p.score);
}
function log(g,s){g.history.push(s);}
function newGame(random=Math.random){const d=deck();for(let i=d.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}const hands=[[],[],[]];d.slice(0,51).forEach((c,i)=>hands[i%3].push(c));hands.forEach(sort);const start=Math.floor(random()*3);return {hands,kitty:d.slice(51),turn:start,phase:'bid',bids:[],high:0,landlord:null,top:null,passes:0,discard:[],history:[],multiplier:1,plays:[0,0,0]};}
function bid(g,seat,value){if(g.phase!=='bid'||g.turn!==seat)throw Error('还没轮到你叫分');if(!Number.isInteger(value)||value<0||value>3||value&&value<=g.high)throw Error('叫分须高于当前分数');g.bids.push({seat,value});log(g,`${seat+1}号：${value?value+'分':'不叫'}`);if(value){g.high=value;g.landlord=seat;}if(value===3||g.bids.length===3){if(!g.high){g.phase='redeal';log(g,'三家不叫，请重新发牌');return;}g.hands[g.landlord].push(...g.kitty);sort(g.hands[g.landlord]);g.turn=g.landlord;g.phase='play';log(g,`${g.landlord+1}号成为地主，收取三张底牌`);}else g.turn=(seat+1)%3;}
function act(g,seat,ids){if(g.phase!=='play'||g.turn!==seat)throw Error('还没轮到你出牌');if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw Error('牌张重复');if(!ids.length){if(!g.top)throw Error('领出不能不要');log(g,`${seat+1}号：不要`);g.passes++;g.turn=(seat+1)%3;if(g.passes===2){g.turn=g.top.seat;g.top=null;g.passes=0;}return;}
 const cs=ids.map(id=>g.hands[seat].find(c=>c.id===id));if(cs.some(c=>!c))throw Error('只能出自己的牌');const p=classify(cs);if(!beats(p,g.top?.p))throw Error('牌型不合法或没有压过上家');g.hands[seat]=g.hands[seat].filter(c=>!ids.includes(c.id));g.discard.push(...cs);g.top={seat,cards:cs,p};g.passes=0;g.plays[seat]++;if(p.tier)g.multiplier*=2;log(g,`${seat+1}号：${p.type} · ${label(p.score)}`);
 if(!g.hands[seat].length){g.phase='over';g.winner=seat;g.landlordWon=seat===g.landlord;g.spring=g.landlordWon?g.plays.every((n,i)=>i===g.landlord||n===0):g.plays[g.landlord]===1;if(g.spring)g.multiplier*=2;const unit=g.high*g.multiplier;g.scores=[0,1,2].map(i=>(i===g.landlord?2:-1)*unit*(g.landlordWon?1:-1));log(g,`${g.landlordWon?'地主':'农民'}获胜${g.spring?' · 春天翻倍':''}`);return;}g.turn=(seat+1)%3;
}
function bot(g,seat){if(g.turn!==seat)throw Error('还没轮到电脑');if(g.phase==='bid'){const h=g.hands[seat],strength=h.filter(c=>c.r>=15).length+[...new Set(h.map(c=>c.r))].filter(r=>h.filter(c=>c.r===r).length===4).length*2;return bid(g,seat,strength>=5?3:strength>=3&&g.high<2?2:strength>=2&&!g.high?1:0);}const ms=moves(g.hands[seat],g.top?.p);let m=ms.find(x=>x.cards.length===g.hands[seat].length);if(!m&&g.top&&seat!==g.landlord&&g.top.seat!==g.landlord)return act(g,seat,[]);m=m||ms[0];act(g,seat,m?m.cards.map(c=>c.id):[]);}
const api={label,deck,sort,classify,beats,moves,newGame,bid,act,bot};if(typeof module!=='undefined')module.exports=api;root.DDZ=api;
})(typeof globalThis!=='undefined'?globalThis:this);
