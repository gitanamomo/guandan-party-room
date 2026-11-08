'use strict';
const $=s=>document.querySelector(s),names=['你','小卷','桃桃'];let game=DDZ.newGame(),selected=new Set(),timer,hintIndex=0;
const text=c=>c.r>=16?DDZ.label(c.r):c.s+DDZ.label(c.r);
function tiny(c){const el=document.createElement('span');el.className='tiny'+(['♥','♦'].includes(c.s)||c.r===17?' red':'');el.textContent=text(c);return el;}
function render(){
 for(let i=0;i<3;i++){const seat=$('#seat'+i);seat.dataset.role=game.landlord===null?'undecided':game.landlord===i?'landlord':'farmer';seat.dataset.finished=String(game.phase==='over'&&game.hands[i].length===0);seat.replaceChildren();const n=document.createElement('strong'),s=document.createElement('span'),e=document.createElement('em');n.textContent=names[i];s.textContent=`余 ${game.hands[i].length} 张`;e.textContent=game.landlord===null?'等待叫分':(game.landlord===i?'地主':'农民')+(i===0?' · 你':'');const chip=document.createElement('span');chip.className='turn-chip';chip.setAttribute('aria-hidden','true');chip.textContent=game.turn===i?(game.phase==='bid'?'叫分':game.phase==='play'?(game.top?'轮到':'领出'):''):'';seat.append(n,s,e,chip);seat.classList.toggle('active',['bid','play'].includes(game.phase)&&game.turn===i);}
 $('#hand-title').textContent=`你的手牌 · ${game.hands[0].length} 张`;
 const hand=$('#hand'),scroll=hand.scrollLeft;hand.replaceChildren();for(const c of game.hands[0]){const b=document.createElement('button');b.className='card'+(['♥','♦'].includes(c.s)||c.r===17?' red':'');b.dataset.id=c.id;b.setAttribute('aria-label',text(c));b.setAttribute('aria-pressed',String(selected.has(c.id)));b.append(document.createTextNode(DDZ.label(c.r)));if(c.r>=16)b.style.fontSize='13px';const small=document.createElement('small');small.textContent=c.r>=16?'★':c.s;b.append(small);b.onclick=()=>{if(selected.has(c.id))selected.delete(c.id);else selected.add(c.id);b.setAttribute('aria-pressed',String(selected.has(c.id)));selection();};hand.append(b);}hand.scrollLeft=scroll;
 $('#kitty').replaceChildren();if(['play','over'].includes(game.phase))game.kitty.forEach(c=>$('#kitty').append(tiny(c)));else for(let i=0;i<3;i++){const s=document.createElement('span');s.className='tiny';s.textContent='?';$('#kitty').append(s);}
 $('#table-cards').replaceChildren();game.top?.cards.forEach(c=>$('#table-cards').append(tiny(c)));
 $('#table-message').textContent=game.phase==='bid'?names[game.turn]+'叫分 · 当前 '+game.high+' 分':game.phase==='redeal'?'三家不叫，请重新发牌':game.phase==='over'?(game.landlordWon?'地主':'农民')+'获胜':game.top?names[game.top.seat]+' · '+game.top.p.type:names[game.turn]+'领出';
 $('#status').textContent=`底分 ${game.high||'待定'} · 倍率 ×${game.multiplier}`;
 $('#bid-controls').hidden=game.phase!=='bid';document.querySelectorAll('[data-bid]').forEach(b=>{const v=Number(b.dataset.bid);b.disabled=game.turn!==0||v!==0&&v<=game.high;});
 $('#play-controls').hidden=game.phase!=='play';$('#pass').disabled=game.turn!==0||!game.top;$('#suggest').disabled=game.turn!==0;
 $('#next').hidden=!['over','redeal'].includes(game.phase);$('#summary').hidden=game.phase!=='over';if(game.phase==='over')$('#summary').textContent=`${game.landlordWon?'地主':'农民'}获胜${game.spring?' · 春天翻倍':''}。${game.scores.map((v,i)=>names[i]+' '+(v>0?'+':'')+v+'分').join(' / ')}`;
 $('#history').replaceChildren();game.history.slice(-24).reverse().forEach(s=>{const el=document.createElement('div');el.textContent=s.replace(/([1-3])号/g,(_,n)=>names[n-1]);$('#history').append(el);});selection();schedule();
}
function selection(){const cs=game.hands[0].filter(c=>selected.has(c.id)),p=DDZ.classify(cs);$('#play').disabled=game.phase!=='play'||game.turn!==0||!DDZ.beats(p,game.top?.p);$('#hint').textContent=game.phase==='bid'?(game.turn===0?'轮到你叫分。分数越高，底分越高。':'等待'+names[game.turn]+'叫分…'):game.phase==='redeal'?'无人叫分，点击「再来一局」。':game.phase==='over'?'本局结束，点击「再来一局」。':selected.size?`已选 ${selected.size} 张 · ${p?p.type:'不合法的组合'}`:game.turn===0?(game.top?'轮到你，可出牌或不要。':'轮到你领出，不能不要。'):'等待'+names[game.turn]+'出牌…';}
function schedule(){clearTimeout(timer);if(['bid','play'].includes(game.phase)&&game.turn!==0)timer=setTimeout(()=>run(()=>DDZ.bot(game,game.turn)),650);}
function run(fn){try{fn();selected.clear();hintIndex=0;render();}catch(e){$('#hint').textContent=e.message;}}
function restart(){clearTimeout(timer);game=DDZ.newGame();selected.clear();render();}
document.querySelectorAll('[data-bid]').forEach(b=>b.onclick=()=>run(()=>DDZ.bid(game,0,Number(b.dataset.bid))));
$('#play').onclick=()=>run(()=>DDZ.act(game,0,[...selected]));$('#pass').onclick=()=>run(()=>DDZ.act(game,0,[]));$('#clear').onclick=()=>{selected.clear();render();};
$('#suggest').onclick=()=>{const ms=DDZ.moves(game.hands[0],game.top?.p);if(!ms.length){$('#hint').textContent='没有能压过的牌，可以选择「不要」。';return;}selected=new Set(ms[hintIndex++%ms.length].cards.map(c=>c.id));render();};
$('#restart').onclick=()=>$('#restart-modal').showModal();$('#cancel-restart').onclick=()=>$('#restart-modal').close();$('#confirm-restart').onclick=()=>{$('#restart-modal').close();restart();};$('#next').onclick=restart;
$('#rules').onclick=()=>$('#rules-modal').showModal();$('#close-rules').onclick=()=>$('#rules-modal').close();window.addEventListener('pagehide',()=>clearTimeout(timer));render();
