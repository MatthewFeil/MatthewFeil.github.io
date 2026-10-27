const{assert,base,launch,ready}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'quick-start/');await ready(page);
 const chapters=[['open','0',false,false,false],['playback','3',false,false,false],['find','23',false,false,true],['loop','23',true,true,true],['speed','23',true,true,true]];
 for(const[id,position,selection,repeat,playing]of chapters){
  await page.waitForFunction(id=>document.getElementById('guide-camera').dataset.lesson===id&&document.getElementById('guide-camera').dataset.demoPhase==='complete',id,{timeout:45000});
  assert.equal(await page.locator('#transcribe-file-name').textContent(),'example.mp3');
  assert.equal(await page.locator('#transcribe-seek').inputValue(),position);
  assert.equal(await page.locator('#transcribe-selection-only').getAttribute('aria-pressed'),String(selection));
  assert.equal(await page.locator('#transcribe-loop-bottom').getAttribute('aria-pressed'),String(repeat));
  assert.equal(await page.locator('#transcribe-play').getAttribute('aria-label'),playing?'Pause':'Play');
  assert.equal(await page.locator('[data-guide-playback]').getAttribute('aria-label'),'Replay demonstration');
  if(id!=='speed'){await page.locator('[data-guide-section]:visible .guide-next[data-guide-lesson]').click();await ready(page);}
 }
 assert.equal(await page.locator('[data-speed="1"]').getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);
 console.log('Quick start end-to-end: MP3 opening result → playback → navigation → highlighted loop → slower playback → original speed; state and explicit Next progression passed');await page.close();}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
