/* Shared appearance only: never changes hands, seats or network authority. */
(function initPetTheme(){
'use strict';
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',initPetTheme,{once:true});return;}
const pets=['exotic-orange','poodle-black','sphynx-pink','frenchie-black'];
const labels=['橘猫','贵宾犬','斯芬克斯猫','法斗'];
const room=document.querySelector('.room');
const saved=localStorage.getItem('ginaScene');
let theme=['modern','teahouse','pets'].includes(saved)?saved:'pets';
function apply(scene){
 theme=scene;localStorage.setItem('ginaScene',scene);
 room.classList.toggle('theme-pets',scene==='pets');room.classList.toggle('theme-teahouse',scene==='teahouse');
 document.querySelectorAll('[data-scene]').forEach(b=>{b.classList.toggle('active',b.dataset.scene===scene);b.setAttribute('aria-pressed',String(b.dataset.scene===scene));});
 const label=document.querySelector('.room-label,#room-badge');
 if(label)label.textContent=scene==='pets'?'🐾 PetVerse · 午后花园牌局':scene==='teahouse'?'🏮 雅轩茶社 · 中古茶韵':'🏙️ 暖阳会所 · 现代风格';
}
function decorate(){document.querySelectorAll('.room .seat').forEach((seat,i)=>{
 if(!seat.querySelector('strong')||seat.querySelector('.pet-avatar'))return;
 const img=document.createElement('img');img.className='pet-avatar';img.src=`assets/pets/${pets[i%4]}.png`;img.alt=labels[i%4]+'牌友';img.draggable=false;seat.prepend(img);
});}
document.querySelectorAll('[data-scene]').forEach(b=>{b.onclick=()=>apply(b.dataset.scene);});
new MutationObserver(decorate).observe(room,{childList:true,subtree:true});
decorate();apply(theme);
})();
