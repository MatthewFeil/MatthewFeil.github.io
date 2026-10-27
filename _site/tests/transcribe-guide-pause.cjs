const{assert,base,launch,ready,freeze}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'quick-start/#loop/highlight');await ready(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-guide-playback]').click();
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='dragging');await freeze(page);
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='playing');await freeze(page);
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='complete');assert.equal(await page.locator('[data-guide-playback]').getAttribute('aria-label'),'Replay demonstration');
 await page.goto(base+'#pitch/transpose');await ready(page);
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='framing'&&document.getElementById('guide-stage').getAnimations().some(a=>a.playState==='running'));await freeze(page);
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='complete');
 assert.equal(await page.locator('.guide-demo-replay,.guide-demo-caption,#guide-target').count(),0);assert.deepEqual(errors,[]);
 console.log(`${width}px: frame-accurate cursor/canvas/camera/instruction pause, resume and completion passed`);await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
