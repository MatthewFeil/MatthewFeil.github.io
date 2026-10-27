const{assert,base,launch,ready,freeze}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'quick-start/#find/pan');await ready(page);
 assert.equal(await page.locator('[data-step-status],[data-guide-step-label],[data-guide-rail],.guide-walkthrough-progress').count(),0);
 assert(!/walkthrough complete|now showing|step \d of \d/i.test(await page.locator('body').innerText()));
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-guide-playback]').click();await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='panning-timeline');
 const progress=()=>page.locator('#find [data-guide-step="pan"]').evaluate(el=>Number(el.style.getPropertyValue('--step-progress')));
 const first=await progress();await page.waitForTimeout(220);const next=await progress();assert(next>first&&next<1,'Vertical fill advances with the gesture');
 await freeze(page);
 const geometry=await page.locator('#find [data-guide-step]').evaluateAll(rows=>rows.every((row,i)=>{const r=row.getBoundingClientRect(),n=row.querySelector('.guide-step-number').getBoundingClientRect(),style=getComputedStyle(row),top=parseFloat(style.getPropertyValue('--rail-top')),length=parseFloat(style.getPropertyValue('--rail-length'));const end=rows[i+1]?.querySelector('.guide-step-number').getBoundingClientRect().top??r.bottom-4;return Math.abs(r.top+top-n.bottom)<1&&Math.abs(r.top+top+length-end)<1;}));assert(geometry,'Vertical segments connect the actual number bounds');
 if(process.env.TRANSCRIBE_BROWSER_OUTPUT)await page.screenshot({path:`${process.env.TRANSCRIBE_BROWSER_OUTPUT}/guide-vertical-progress-${width}.png`});
 await page.locator('#find [data-guide-jump="seek"]').click();await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.step==='seek');
 assert.equal(await page.locator('#find [data-guide-step="pan"]').evaluate(el=>el.style.getPropertyValue('--step-progress')),'1');assert.equal(await page.locator('#find [data-guide-step="play"]').evaluate(el=>el.style.getPropertyValue('--step-progress')),'0');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.guide-topics [data-guide-lesson="speed"]').click();await ready(page);await page.locator('#speed [data-guide-jump="normal"]').click();await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.step==='normal'&&document.getElementById('guide-camera').dataset.demoPhase==='static');
 assert.equal(await page.locator('#speed [data-guide-step="normal"]').evaluate(el=>el.style.getPropertyValue('--step-progress')),'1');assert.deepEqual(errors,[]);
 console.log(`${width}px: connected number rails, live fill, frozen progress during pause, step jumps, reduced motion and removed status text passed`);await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
