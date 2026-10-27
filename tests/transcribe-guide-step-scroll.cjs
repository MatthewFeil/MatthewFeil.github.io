const {assert,base,launch,ready}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{for(const [width,height] of [[1440,500],[390,568],[320,568]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'quick-start/#find/seek');await ready(page);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.followScrolling==='true');
 const initial=await page.evaluate(()=>scrollY);await page.waitForTimeout(80);const moving=await page.evaluate(()=>scrollY);assert(moving>initial,'Auto advance scrolls through intermediate positions');
 await page.evaluate(()=>document.querySelector('[data-guide-playback]').click());const held=await page.evaluate(()=>scrollY);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>scrollY),held,'Pause freezes follow scrolling');
 await page.evaluate(()=>document.querySelector('[data-guide-playback]').click());await page.waitForFunction(()=>!document.getElementById('guide-camera').dataset.followScrolling);assert((await page.evaluate(()=>scrollY))>=held);
 await page.evaluate(()=>{location.hash='find/seek';scrollTo({top:0,behavior:'instant'});});
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.followScrolling==='true');await page.mouse.wheel(0,-60);
 await page.waitForFunction(()=>!document.getElementById('guide-camera').dataset.followScrolling);await page.waitForTimeout(100);const reader=await page.evaluate(()=>scrollY);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>scrollY),reader,'Wheel input cancels automatic scrolling');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-guide-rate]').selectOption('2');
 await page.evaluate(()=>{location.hash='find/seek';scrollTo({top:0,behavior:'instant'});});await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.step==='seek'&&document.getElementById('guide-camera').dataset.demoPhase==='static');
 await page.evaluate(()=>document.querySelector('[data-guide-playback]').click());await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.step==='play');assert.equal(await page.locator('#guide-camera').getAttribute('data-follow-scrolling'),null);assert((await page.evaluate(()=>scrollY))>0);
 assert.deepEqual(errors,[]);console.log(`${width}: eased automatic scrolling, pause/resume, reader interruption and reduced motion passed`);await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
