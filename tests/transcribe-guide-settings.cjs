const {assert,base,launch,ready,openContents,snapshot}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'quick-start/#find/pan');await ready(page);
 const auto=page.locator('[data-guide-autoplay]'),rate=page.locator('[data-guide-rate]');assert(await auto.isChecked());assert.equal(await rate.inputValue(),'1');
 await auto.uncheck();assert.equal(await page.locator('[data-guide-playback]').getAttribute('aria-label'),'Resume demonstration');const held=await snapshot(page);await page.waitForTimeout(200);assert.equal(await snapshot(page),held);
 await openContents(page);await page.locator('.guide-topics [data-guide-lesson="speed"]').click();await ready(page);assert.equal(await page.locator('#guide-camera').getAttribute('data-demo-phase'),'idle');assert.equal(await page.locator('[data-guide-playback]').getAttribute('aria-label'),'Play demonstration');
 const idle=await snapshot(page);await page.waitForTimeout(200);assert.equal(await snapshot(page),idle);await rate.selectOption('2');await page.locator('[data-guide-playback]').click();
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='pointing',{},{timeout:5000});
 await page.locator('[data-guide-playback]').click();assert.equal(await rate.inputValue(),'2');await rate.selectOption('0.5');const paused=await snapshot(page);await page.waitForTimeout(200);assert.equal(await snapshot(page),paused,'Rate change preserves paused frame');
 await auto.check();assert.equal(await page.locator('[data-guide-playback]').getAttribute('aria-label'),'Pause demonstration');await auto.uncheck();
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width===390||width===1440)await page.screenshot({path:`/private/tmp/guide-settings-${width}-${theme}.png`});}
 assert(await page.locator('.guide-viewer').evaluate(el=>innerWidth>1100||el.offsetHeight<=innerHeight/3+10));
 await page.emulateMedia({reducedMotion:'reduce'});await auto.check();await openContents(page);await page.locator('.guide-topics [data-guide-lesson="open"]').click();await ready(page);assert.equal(await page.locator('#guide-camera').getAttribute('data-demo-phase'),'static');
 assert.deepEqual(errors,[]);console.log(`${width}: defaults, autoplay, manual start, speed, paused frames, themes and reduced motion passed`);await page.close();
}
const page=await browser.newPage();await page.goto(base);assert.equal(await page.locator('[data-guide-autoplay]').count(),0);await page.close();
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
