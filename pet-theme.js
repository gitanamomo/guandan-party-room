/* Cinema presentation: rules and network authority stay in their existing engines. */
(function initPetTheme(){
'use strict';
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initPetTheme,{once:true});return;}
const room=document.querySelector('.room');if(!room)return;
const isDDZ=!!document.querySelector('[data-bid]');
document.body.classList.add('cinema');document.body.dataset.game=isDDZ?'doudizhu':'guandan';
const layout=document.querySelector('.layout'),aside=layout?.querySelector('aside'),hand=document.querySelector('.handarea');
if(layout){layout.classList.add('game-shell');if(aside){aside.classList.add('score-ribbon');layout.prepend(aside);}if(hand)layout.append(hand);}
if(isDDZ){const summary=document.querySelector('#summary');if(summary)document.querySelector('main').insertBefore(summary,layout);}
const sceneLabel=document.querySelector('.room-label,#room-badge');
let theme=localStorage.getItem('ginaScene');if(!['pets','modern','teahouse'].includes(theme))theme='pets';
function apply(scene){
 theme=scene;localStorage.setItem('ginaScene',scene);
 room.classList.toggle('theme-pets',scene==='pets');room.classList.toggle('theme-teahouse',scene==='teahouse');document.body.dataset.scene=scene;
 document.querySelectorAll('button[data-scene]').forEach(b=>{const on=b.dataset.scene===scene;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));if(b.dataset.scene==='pets')b.textContent='森光宠物会所';});
 if(sceneLabel)sceneLabel.textContent=scene==='pets'?'PETVERSE · 森光会所':scene==='teahouse'?'雅轩茶社 · 经典场景':'暖阳会所 · 经典场景';
}
function decorate(){
 document.querySelectorAll('.room .seat').forEach((seat,i)=>{seat.dataset.seat=String(i);seat.querySelector('.pet-avatar')?.remove();});
 const played=room.querySelectorAll('#table-cards .tiny').length;room.dataset.longPlay=String(played>14);room.style.setProperty('--played-font',played>14?'10px':'13px');
 document.querySelectorAll('.card').forEach(card=>{const suit=card.querySelector('small')?.textContent||'';card.dataset.suit=suit;const rank=card.firstChild?.nodeType===Node.TEXT_NODE?card.firstChild.nodeValue:'';card.dataset.rank=rank||'';card.classList.toggle('joker',rank.includes('王'));});
}
document.querySelectorAll('button[data-scene]').forEach(b=>b.onclick=()=>apply(b.dataset.scene));
new MutationObserver(decorate).observe(room,{childList:true,subtree:true});
const handBox=document.querySelector('#hand');if(handBox)new MutationObserver(decorate).observe(handBox,{childList:true});
decorate();apply(theme);
})();
