const {chromium}=require('playwright');
const assert=require('node:assert/strict');
require('node:fs').mkdirSync('docs/verification-2026-11-08',{recursive:true});
// Optional browser check: npm install --no-save --package-lock=false playwright && node tests/browser-smoke.cjs
// Start server.cjs on PORT=8778 first; closes each browser context when finished.
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});let errors=[];
for(const viewport of [{width:1440,height:1050},{width:390,height:844}]){
 const context=await browser.newContext({viewport});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1')&&r.status()>=400)errors.push(r.status()+' '+r.url());});
 await page.goto('http://127.0.0.1:8778/index.html');await page.waitForLoadState('networkidle');
 assert(await page.locator('.room').evaluate(el=>el.classList.contains('theme-pets')));assert.equal(await page.locator('.pet-avatar').count(),4);
 assert(await page.locator('.pet-avatar').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)));
 await page.locator('#btn-scene-modern').click();assert(!(await page.locator('.room').evaluate(el=>el.classList.contains('theme-pets'))));
 await page.locator('#btn-scene-teahouse').click();assert(await page.locator('.room').evaluate(el=>el.classList.contains('theme-teahouse')));
 await page.locator('#btn-scene-pets').click();await page.reload();await page.waitForLoadState('networkidle');assert(await page.locator('.room').evaluate(el=>el.classList.contains('theme-pets')));
 await page.screenshot({path:`docs/verification-2026-11-08/guandan-${viewport.width}.png`,fullPage:true});
 await page.locator('a[href="doudizhu.html"]').first().click();await page.waitForLoadState('networkidle');
 assert.equal(await page.locator('.pet-avatar').count(),3);await page.waitForFunction(()=>game.phase!=='bid'||game.turn===0);
 if(await page.evaluate(()=>game.phase==='bid'))await page.locator('[data-bid="3"]').click();
 await page.waitForFunction(()=>game.phase==='play'&&game.turn===0);
 await page.locator('#suggest').click();assert(await page.locator('#hand [aria-pressed=true]').count()>0);assert(await page.locator('#play').isEnabled());
 const before=await page.locator('#hand .card').count();await page.locator('#play').click();assert(await page.locator('#hand .card').count()<before);
 await page.locator('#rules').click();assert(await page.locator('#rules-modal').evaluate(e=>e.open));await page.locator('#close-rules').click();
 await page.screenshot({path:`docs/verification-2026-11-08/doudizhu-${viewport.width}.png`,fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'document overflow');
 // Complete an actual UI game with public hint/play/pass controls.
 let actions=0;while(await page.evaluate(()=>game.phase==='play')&&actions++<180){await page.waitForFunction(()=>game.phase!=='play'||game.turn===0);if(await page.evaluate(()=>game.phase!=='play'))break;await page.locator('#suggest').click();if(await page.locator('#play').isEnabled())await page.locator('#play').click();else await page.locator('#pass').click();}
 assert.equal(await page.evaluate(()=>game.phase),'over');assert(await page.locator('#summary').isVisible());await page.locator('#next').click();assert(await page.locator('#summary').isHidden());
 await page.goto('http://127.0.0.1:8778/room.html');await page.waitForLoadState('networkidle');assert(await page.locator('#btn-scene-pets').isVisible());assert(await page.locator('.room').evaluate(el=>el.classList.contains('theme-pets')));await page.locator('#btn-scene-modern').click();assert(!(await page.locator('.room').evaluate(el=>el.classList.contains('theme-pets'))));
 console.log(`PASS ${viewport.width}px: pet scenes/persistence/assets, DDZ bid/hint/play/full game/result/redeal, room theme, no overflow`);await context.close();
}
await browser.close();assert.deepEqual(errors,[]);console.log('PASS no JS errors or missing local resources');})().catch(e=>{console.error(e);process.exit(1);});
