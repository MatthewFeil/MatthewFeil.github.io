const {assert,base,launch,ready,openContents}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{
 for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.runtimeCalls=[];for(const name of ['AudioContext','webkitAudioContext','Worker'])window[name]=class{constructor(){window.runtimeCalls.push(name);throw Error(name);}};indexedDB.open=()=>{window.runtimeCalls.push('IndexedDB');throw Error('Unexpected persistence');};});
  await page.goto(base);assert.match(await page.title(),/Transcribe User Guide/);
  assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('.guide-viewer').isVisible(),false);
  assert.equal(await page.locator('#guide-article > section:visible').count(),11);
  assert.equal(await page.locator('[data-guide-mockup]').count(),1);
  const links=await page.locator('[data-guide-demo]').evaluateAll(els=>els.map(el=>el.dataset.guideDemo));
  for(const key of links){
   const link=page.locator(`[data-guide-demo="${key}"]`);await link.click();await ready(page);
   await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='static');
   const first=await page.locator('#guide-demo-article section:visible [data-guide-step]').first().getAttribute('data-guide-step');
   assert.equal(await page.locator('#guide-camera').getAttribute('data-step'),first,`${key}: article links start at step one`);
   assert.equal(await link.getAttribute('href'),`#${key.split('/')[0]}/${first}`,'New-tab links also start at step one');
   // Explicit step controls still let readers inspect later actions.
   const target=key.split('/')[1];
   if(target!==first){await page.locator(`#guide-demo-article section:visible [data-guide-jump="${target}"]`).click();await page.waitForFunction(id=>document.getElementById('guide-camera').dataset.step===id&&document.getElementById('guide-camera').dataset.demoPhase==='static',target);}
   assert.equal(await page.locator('dialog[open]').count(),1);assert.equal(await page.locator('[aria-current="step"]').count(),1);
   const box=await page.locator('[data-guide-dialog]').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,`${width} ${key}: dialog fits`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(key==='stems/mute')assert.equal(await page.locator('[data-stem="vocals"] button').innerText(),'Off');
   if(key==='eq/band')assert.equal(await page.locator('[aria-label="Band 2 gain"]').inputValue(),'8');
   if(key==='analysis/whole')assert.equal(await page.locator('#transcribe-analyze-selection').getAttribute('aria-pressed'),'true');
   await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
   assert.equal(await link.evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('#guide-camera').getAttribute('data-demo-phase'),'none');
  }
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   await openContents(page);await page.locator('.guide-topics a[href="#stems"]').click();assert.equal(await page.locator('dialog[open]').count(),0);
   await page.screenshot({path:`/private/tmp/full-guide-${width}-${theme}.png`});
   await page.locator('[data-guide-demo="eq/band"]').click();await ready(page);await page.screenshot({path:`/private/tmp/full-guide-demo-${width}-${theme}.png`});await page.locator('[data-guide-close]').click();
  }
  await page.keyboard.press('Alt+Shift+KeyK');assert.equal(await page.locator('html').getAttribute('data-keyboard-navigation'),'on');
  assert.deepEqual(await page.evaluate(()=>window.runtimeCalls),[]);assert.deepEqual(errors,[]);console.log(`${width}x${height}: complete text, all demo links, modal bounds, Escape/focus, themes and no app runtime passed`);await page.close();
 }
 const page=await browser.newPage({javaScriptEnabled:false});await page.goto(base);assert.equal(await page.locator('#guide-article > section:visible').count(),11);assert.match(await page.locator('#stems').innerText(),/136 MB/);await page.close();
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
