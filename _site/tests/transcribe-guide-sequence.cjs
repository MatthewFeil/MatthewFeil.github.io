const{assert,base,launch,ready}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'quick-start/#loop/highlight');await ready(page);await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{
  window.stepsSeen=[];window.playActions=[];window.loopSeen=false;window.effectVisible=true;let previous,playing=document.getElementById('transcribe-play').classList.contains('is-playing');
  new MutationObserver(()=>{const camera=document.getElementById('guide-camera'),key=camera.dataset.step;if(window.stepsSeen.at(-1)!==key)window.stepsSeen.push(key);
    const button=document.getElementById('transcribe-play'),on=button.classList.contains('is-playing');
    if(on!==playing){playing=on;const target=button.getBoundingClientRect(),cursor=document.querySelector('.guide-demo-pointer').getBoundingClientRect();window.playActions.push({on,hit:cursor.left+3>=target.left-1&&cursor.left+3<=target.right+1&&cursor.top+2.25>=target.top-1&&cursor.top+2.25<=target.bottom+1});}
  }).observe(document.getElementById('guide-camera'),{subtree:true,attributes:true});
  function sample(){const camera=document.getElementById('guide-camera');if(camera.dataset.demoPhase==='playing'){
   const position=Number(document.getElementById('transcribe-seek').value),bounds=camera.getBoundingClientRect(),wave=document.getElementById('transcribe-waveform').getBoundingClientRect();
   if(previous!==undefined&&position<previous-1)window.loopSeen=true;previous=position;
   window.effectVisible&&=wave.left>=bounds.left-1&&wave.right<=bounds.right+1&&wave.top>=bounds.top-1&&wave.bottom<=bounds.bottom+1;
  }requestAnimationFrame(sample);}requestAnimationFrame(sample);
 });
 await page.locator('[data-guide-playback]').click();await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='complete');
 assert.deepEqual(await page.evaluate(()=>window.stepsSeen),['highlight','repeat','play']);
 assert.deepEqual(await page.evaluate(()=>window.playActions),[]);
 assert.equal(await page.evaluate(()=>window.loopSeen&&window.effectVisible),true);
 assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-guide-jump'),'play');
 assert.equal(await page.locator('#transcribe-selection-only').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#transcribe-loop-bottom').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('[data-guide-playback]').getAttribute('aria-label'),'Replay demonstration');
 await page.locator('[data-guide-playback]').click();await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.step==='highlight'&&document.getElementById('guide-camera').dataset.demoPhase==='pointing');
 await page.locator('.guide-topics [data-guide-lesson="open"]').click();await ready(page);await page.waitForTimeout(250);assert.equal(await page.locator('#transcribe-file-name').textContent(),'Open audio');
 assert.deepEqual(errors,[]);console.log(`${width}px: one continuous loop lesson, synchronized steps, continuous playback without redundant Play/Pause actions, looping effect, whole-lesson replay and cancellation passed`);await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
