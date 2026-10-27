const{assert,base,launch,ready,freeze}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'#eq/band');await ready(page);
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='dragging');
 await freeze(page);
 await page.waitForFunction(()=>document.querySelector('[aria-label="Band 2 gain"]').value==='8');
 assert.equal(await page.locator('#transcribe-section-eq .eq-point').nth(1).getAttribute('transform'),'translate(595.5143714486105 326)');
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='complete');
 assert.equal(await page.locator('[aria-label="Band 2 gain"]').inputValue(),'0');
 await page.locator('[data-guide-close]').click();
 await page.locator('[data-guide-demo="stems/mute"]').click();await ready(page);
 await page.waitForFunction(()=>document.querySelector('[data-stem="vocals"] button').textContent==='Off');
 assert.equal(await page.locator('[data-stem="drums"] button').innerText(),'On');
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='complete');
 assert.equal(await page.locator('.transcribe-stem-list').isVisible(),false);
 await page.locator('[data-guide-close]').click();
 await page.locator('[data-guide-demo="measures/move"]').click();await ready(page);
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='dragging');await freeze(page);
 await page.waitForFunction(()=>document.getElementById('transcribe-go-measure').value==='B3');
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='complete');
 assert.equal(await page.locator('#transcribe-seek').inputValue(),'16');assert.equal(await page.locator('#transcribe-measure-panel').isVisible(),false);
 // Close during a fresh gesture, then ensure cancellation cannot repaint the reading page.
 await page.locator('[data-guide-playback]').click();await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='pointing');
 await page.keyboard.press('Escape');await page.waitForTimeout(800);assert.equal(await page.locator('#guide-camera').getAttribute('data-demo-phase'),'none');
 await page.goto(base+'#highlight');await ready(page);assert.equal(await page.locator('dialog[open]').count(),1);
 await page.setViewportSize({width:width===1440?844:568,height:390});await ready(page);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log(width+': animated EQ/reset, stems switches/reset, marker drag/navigation, exact-frame pause, cancellation, aliases and resize passed');await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
