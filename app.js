'use strict';
const $=s=>document.querySelector(s),names=['你','小禾','阿棠','老周'];let game=GD.newGame(),selected=new Set(),timer,soundOn=false,audio;
/* 渲染层私有状态（与游戏状态分离，不进 engine.js） */
const handEls=new Map(),seatEls=[],REDUCED=matchMedia('(prefers-reduced-motion: reduce)');
let prev={game:null,round:-1,topSig:null};
function sound(){if(!soundOn)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const t=audio.currentTime;const o=audio.createOscillator(),v=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(360,t);o.frequency.exponentialRampToValueAtTime(150,t+.1);v.gain.setValueAtTime(.08,t);v.gain.exponentialRampToValueAtTime(.001,t+.12);o.connect(v);v.connect(audio.destination);o.start(t);o.stop(t+.13);}catch{}}
function cardText(c){return c.r>=16?GD.label(c.r):c.s+GD.label(c.r);}
function desc(p){return p.type+' · '+(p.type==='四王炸'?'大小王各两张':p.rs.map(GD.label).join(' '));}
function hint(s){$('#hint').textContent=s;}
function isReturn(){return game.phase==='return'&&game.returns.some(x=>x.from===0);}
function selection(){const cards=game.hands[0].filter(c=>selected.has(c.id));const opts=GD.classify(cards,game.level).filter(p=>GD.beats(p,game.top?.p));const box=$('#interpretation'),old=box.value;box.replaceChildren();opts.forEach(p=>{let o=document.createElement('option');o.value=p.key;o.textContent=desc(p);box.append(o);});if(opts.some(p=>p.key===old))box.value=old;box.hidden=!opts.length||isReturn();$('#play').disabled=isReturn()?cards.length!==1:game.phase!=='play'||game.turn!==0||!opts.length;$('#play').textContent=isReturn()?'确认还贡':'出牌';hint(isReturn()?'请选择一张允许的牌还贡（≤10非级牌；没有则最小牌）':selected.size?`已选 ${selected.size} 张${opts.length?' · 可选择牌型声明':' · 无合法可出的牌型'}`:game.phase==='over'?'本副结束，点击下一副继续':game.phase==='return'?'等待电脑牌友还贡':game.turn===0?(game.top?'轮到你，可压牌或不要':'轮到你领出，不能不要'):`等待${names[game.turn]}出牌…`);}
/* ---- 特效工具：will-change 只在动画期间挂，animationend 回收，并发上限 8 ---- */
function fxEls(els){if(REDUCED.matches)return;els.slice(0,8).forEach(el=>{el.classList.add('fx');el.addEventListener('animationend',()=>el.classList.remove('fx'),{once:true});});}
/* 离场：animationend 回收 + 280ms 兜底（后台标签页可能不派发事件）；忽略子元素冒泡 */
function fadeOut(el){if(REDUCED.matches){el.remove();return;}el.classList.add('leaving');let t=setTimeout(finish,280);function finish(){clearTimeout(t);el.removeEventListener('animationend',onEnd);el.remove();}function onEnd(e){if(e.target===el)finish();}el.addEventListener('animationend',onEnd);}
/* ---- 角标语义（见 design/polish/turn-chip-semantics.md）----
   金色角标 = 该座位当前拥有行动权。不变量：角标可见 ⟺ .seat.active ⟺ 可立即行动。
   唯一例外是双贡——两张卡同时显示「还贡」，因还贡本身并行。
   注意 returns 的 from 是收贡方（还贡义务人）、to 是进贡方，方向与直觉相反（engine.js:29）。 */
function chipText(i){
if(game.phase==='return')return game.returns.some(r=>r.from===i)?'还贡':'';
if(game.phase!=='play'||game.turn!==i)return '';
return game.top?'轮到':'领出';
}
/* aria 不受宽度约束，必须输出完整义务说明（10 态，判定有序互斥：S0→S6→S3/S7/S8→S1/S2→S4/S5→S9） */
function chipAria(i,place){
if(game.phase==='over')return game.champion!==undefined?'本场结束':'本副结束';
if(place>=0)return '已走完';
if(game.phase==='return')return game.returns.some(r=>r.from===i)?'轮到，需要还贡':game.returns.some(r=>r.to===i)?'等待对方还贡':'等待中';
if(game.turn!==i)return game.top?.seat===i?'等待其他玩家回应':game.last[i]?.pass?'已不要，等待中':'等待中';
return game.top?'轮到，可压牌或不要':'轮到，领出，不能不要';
}
/* ---- 座位区：strong/span/em/chip 只建一次，之后只改 textContent ---- */
function renderSeats(){for(let i=0;i<4;i++){const el=$('#seat'+i);if(!seatEls[i]){const n=document.createElement('strong'),c=document.createElement('span'),em=document.createElement('em'),chip=document.createElement('span');chip.className='turn-chip';chip.setAttribute('aria-hidden','true');el.replaceChildren(n,c,em,chip);seatEls[i]={n,c,em,chip};}
const s=seatEls[i],place=game.finished.indexOf(i),last=game.last[i];
s.n.textContent=names[i]+(i===2?' · 队友':'');
s.c.textContent=place>=0?(game.result?.double&&place>1?'双下':['头游','二游','三游','末游'][place]):`余 ${game.hands[i].length} 张`;
s.em.textContent=last?(last.pass?'不要':last.p.type):i%2===0?'青松队':'暖阳队';
/* active 判定完全不变（它已等价于「有行动权」），故 R2 的 ::after 轮转动画零影响 */
const active=game.phase==='play'&&game.turn===i||game.phase==='return'&&game.returns.some(r=>r.from===i);
el.classList.toggle('active',active);
s.chip.textContent=chipText(i);
el.setAttribute('aria-label',`${names[i]} · ${s.c.textContent} · ${s.em.textContent} · ${chipAria(i,place)}`);}}
/* ---- 桌面出牌区：签名守卫 + 离场队列（不做 keyed diff） ---- */
const topSig=g=>g.top?`${g.top.seat}|${g.top.p.key}|${g.top.cards.map(c=>c.id).join(',')}`:'';
function renderTable(){
$('#table-message').textContent=game.phase==='over'?'本副结束':game.phase==='return'?'贡牌已送达 · 正在还贡':game.top?names[game.top.seat]+' · '+desc(game.top.p):names[game.turn]+'领出 · 请选择牌型';
const box=$('#table-cards'),sig=topSig(game);
if(sig===prev.topSig)return;
if(sig){
box.querySelectorAll('.group').forEach(g=>g.remove());
const g=document.createElement('div');g.className='group';g.dataset.seat=game.top.seat;
game.top.cards.forEach((c,i)=>{const el=document.createElement('span');el.className='tiny'+(['♥','♦'].includes(c.s)||c.r===17?' red':'');el.textContent=cardText(c);el.style.setProperty('--i',String(Math.min(i,5)));g.append(el);});
box.append(g);fxEls([...g.children]);
}else{box.querySelectorAll('.group:not(.leaving)').forEach(fadeOut);}
prev.topSig=sig;}
/* ---- 手牌区：id-keyed 增量更新 + round epoch 守卫（R1） ---- */
function makeCard(c){const b=document.createElement('button');b.className='card'+(['♥','♦'].includes(c.s)||c.r===17?' red':'');b.setAttribute('aria-label',cardText(c)+(GD.wild(c,game.level)?'，逢人配':''));b.setAttribute('aria-pressed',selected.has(c.id));b.dataset.id=c.id;b.dataset.lv=String(game.level);b.append(document.createTextNode(GD.label(c.r)));if(c.r>=16)b.style.fontSize='14px';const s=document.createElement('small');s.textContent=c.r<16?c.s:'★';b.append(s);if(c.r===game.level){let badge=document.createElement('span');badge.className='badge';badge.textContent=GD.wild(c,game.level)?'逢人配':'级牌';b.append(badge);}b.onclick=()=>{if(selected.has(c.id))selected.delete(c.id);else selected.add(c.id);b.setAttribute('aria-pressed',selected.has(c.id));selection();};return b;}
function updateCard(el,c){el.setAttribute('aria-pressed',String(selected.has(c.id)));if(el.dataset.lv===String(game.level))return;el.dataset.lv=String(game.level);el.setAttribute('aria-label',cardText(c)+(GD.wild(c,game.level)?'，逢人配':''));const bd=el.querySelector('.badge'),want=c.r===game.level;if(want){if(bd)bd.textContent=GD.wild(c,game.level)?'逢人配':'级牌';else{let n=document.createElement('span');n.className='badge';n.textContent=GD.wild(c,game.level)?'逢人配':'级牌';el.append(n);}}else if(bd)bd.remove();}
/* 焦点只能落到「不会被移除」的邻居上，否则连出多张时焦点仍会掉到 body */
function moveFocus(el,keep){let n=el.nextElementSibling;while(n&&!keep.has(n.dataset.id))n=n.nextElementSibling;let p=el.previousElementSibling;while(p&&!keep.has(p.dataset.id))p=p.previousElementSibling;const next=n||p||['#next','#play','#pass','#clear'].map($).find(b=>b&&!b.disabled&&!b.hidden);if(next)next.focus?.({preventScroll:true});}
function resetHandEpoch(){prev.game=null;prev.round=-1;}
function renderHand(){
const hand=$('#hand'),scroll=hand.scrollLeft;
/* R1：deck() 每副生成完全相同的 108 个 id，必须强制重建，否则复用上一副的节点 */
if(game!==prev.game||game.round!==prev.round){hand.replaceChildren();handEls.clear();prev.game=game;prev.round=game.round;}
const keep=new Set();
game.hands[0].forEach(c=>{keep.add(c.id);let el=handEls.get(c.id);if(el)updateCard(el,c);else{el=makeCard(c);handEls.set(c.id,el);}});
for(const [id,el] of handEls)if(!keep.has(id)){if(el===document.activeElement||el.contains(document.activeElement))moveFocus(el,keep);el.remove();handEls.delete(id);}
let cursor=hand.firstChild;
game.hands[0].forEach(c=>{const el=handEls.get(c.id);if(el===cursor){cursor=cursor.nextSibling;return;}hand.insertBefore(el,cursor);});
$('#hand-title').textContent=`你的手牌 · ${game.hands[0].length} 张`;
hand.scrollLeft=scroll;}
function renderStatus(){$('#ours').textContent=GD.label(game.levels[0]);$('#theirs').textContent=GD.label(game.levels[1]);$('#round').textContent=`第 ${game.round} 副 · ${game.phase==='over'?'下副打':'当前打'}`;$('#level').textContent=GD.label(game.level);$('#wildlabel').textContent=`红桃 ${GD.label(game.level)} 是逢人配`;}
function renderControls(){$('#pass').disabled=game.phase!=='play'||game.turn!==0||!game.top;$('#suggest').disabled=!(isReturn()||game.phase==='play'&&game.turn===0);$('#next').hidden=game.phase!=='over'||game.champion!==undefined;}
function renderSummary(){const sum=$('#summary');sum.hidden=game.phase!=='over';if(game.phase==='over'){let r=game.result;sum.textContent=`${r.team===0?'青松队':'暖阳队'}获胜 · ${r.double?'双上，升3级':r.order.map((s,i)=>`${['头游','二游','三游','末游'][i]}：${names[s]}`).join(' / ')+' · 升'+r.up+'级'}${game.champion!==undefined?' · 成功过A，本场结束！':''}`;}}
function renderHistory(){$('#history').replaceChildren();game.history.slice(-18).reverse().forEach(s=>{let d=document.createElement('div');d.textContent=s.replace(/([1-4])号/g,(_,n)=>names[Number(n)-1]);$('#history').append(d);});}
/* renderControls 先于 renderHand：其只依赖 game 状态；提前是让 renderHand 的焦点救援
   读到已刷新的 #next.hidden（K3）——手牌出完时应落到「下一副」而非「取消选择」 */
function render(){renderSeats();renderStatus();renderTable();renderControls();renderHand();renderSummary();renderHistory();selection();schedule();}
function schedule(){clearTimeout(timer);let seat=game.phase==='return'?game.returns.find(x=>x.from!==0)?.from:game.phase==='play'&&game.turn!==0?game.turn:undefined;if(seat!==undefined)timer=setTimeout(()=>{try{GD.bot(game,seat);render();}catch(e){hint('牌局错误：'+e.message);}},750);}
function action(fn){try{fn();selected.clear();sound();render();}catch(e){hint(e.message);}}
$('#play').onclick=()=>action(()=>isReturn()?GD.giveBack(game,0,[...selected][0]):GD.act(game,0,[...selected],$('#interpretation').value));
$('#pass').onclick=()=>action(()=>GD.act(game,0,[]));
$('#clear').onclick=()=>{selected.clear();render();};
let suggestionIndex=0;$('#suggest').onclick=()=>{if(isReturn()){selected=new Set([GD.returnChoices(game,0).at(-1).id]);render();return;}let ms=GD.moves(game.hands[0],game.level,game.top?.p);ms.sort((a,b)=>a.p.tier-b.p.tier||(game.top?0:b.cards.length-a.cards.length)||a.p.score-b.p.score);if(!ms.length){hint('没有能压过的牌，可以选择"不要"');return;}const m=ms[suggestionIndex++%ms.length];selected=new Set(m.cards.map(c=>c.id));render();$('#interpretation').value=m.p.key;};
$('#next').onclick=()=>action(()=>{GD.deal(game);resetHandEpoch();});
$('#rules').onclick=()=>$('#rules-modal').showModal();
$('#close-rules').onclick=()=>$('#rules-modal').close();
$('#restart').onclick=()=>$('#restart-modal').showModal();
$('#cancel-restart').onclick=()=>$('#restart-modal').close();
$('#confirm-restart').onclick=()=>{clearTimeout(timer);game=GD.newGame();selected.clear();resetHandEpoch();$('#restart-modal').close();render();};
$('#sound').onclick=()=>{soundOn=!soundOn;$('#sound').textContent='声音：'+(soundOn?'开':'关');sound();};
/* 场景与背景音乐控制 */
const bgm=$('#bgm-player');
let bgmOn=localStorage.getItem('ginaBgmOn')!=='false';
function updateBgmUI(){const b=$('#btn-bgm');if(b)b.textContent='🎵 音乐：'+(bgmOn?'开':'关');}
function toggleBgm(){
  bgmOn=!bgmOn;localStorage.setItem('ginaBgmOn',String(bgmOn));
  if(bgmOn&&bgm){bgm.volume=0.35;bgm.play().catch(()=>{});}else if(bgm){bgm.pause();}
  updateBgmUI();
}
if($('#btn-bgm'))$('#btn-bgm').onclick=toggleBgm;
updateBgmUI();

let currentScene=localStorage.getItem('ginaScene')||'modern';
function applyScene(scene){
  currentScene=scene;localStorage.setItem('ginaScene',scene);
  const roomEl=$('.room'),labelEl=$('.room-label'),mBtn=$('#btn-scene-modern'),tBtn=$('#btn-scene-teahouse');
  if(scene==='teahouse'){
    roomEl?.classList.add('theme-teahouse');
    if(labelEl)labelEl.textContent='🏮 雅轩茶社 · 中古茶韵';
    mBtn?.classList.remove('active');tBtn?.classList.add('active');
  }else{
    roomEl?.classList.remove('theme-teahouse');
    if(labelEl)labelEl.textContent='🏙️ 暖阳会所 · 现代风格';
    mBtn?.classList.add('active');tBtn?.classList.remove('active');
  }
}
if($('#btn-scene-modern'))$('#btn-scene-modern').onclick=()=>applyScene('modern');
if($('#btn-scene-teahouse'))$('#btn-scene-teahouse').onclick=()=>applyScene('teahouse');
applyScene(currentScene);

window.addEventListener('click',()=>{if(bgmOn&&bgm){bgm.volume=0.35;bgm.play().catch(()=>{});}},{once:true});
window.addEventListener('pagehide',()=>clearTimeout(timer));
render();