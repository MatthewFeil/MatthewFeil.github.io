const{assert,base,launch,ready}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{for(const[width,height]of[[1440,900],[1000,800],[390,844],[320,568],[844,390],[568,320]]){
 const measures=[];
 for(const quick of [true,false]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));await page.goto(base+(quick?'quick-start/#find/play':''));
  await page.bringToFront();await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.querySelector('[data-guide-contents-current]').textContent.trim()).catch(async error=>{console.error({width,quick,errors,failed,state:await page.locator('#guide-camera').evaluate(el=>({...el.dataset})),label:await page.locator('[data-guide-contents-current]').innerText()});throw error;});
  const contents=page.locator('.guide-contents'),summary=contents.locator('summary');
  assert.equal(await contents.evaluate(el=>el.open),width>1100);assert.equal(await summary.isVisible(),width<=1100);
  assert.equal(await page.locator('.guide-kicker').count(),0);
  const nav=await page.locator('.guide-topics').boundingBox();measures.push({x:nav.x,y:nav.y,width:nav.width});
  if(width<=1100){
   await summary.click();assert.equal(await contents.evaluate(el=>el.open),true);
   const link=page.locator('.guide-topic-links a').filter({hasText:quick?'Playback Speed':'Stem Separation'});await link.click();
   assert.equal(await contents.evaluate(el=>el.open),false);
   await page.waitForFunction(text=>document.querySelector('[data-guide-contents-current]').textContent.trim()===text,quick?'Playback Speed':'Stem Separation');
  }
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.waitForTimeout(180);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if((width===1440&&theme==='light')||(width===390&&theme==='dark')||(width===320&&theme==='light')||(width===844&&theme==='dark')){
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`/private/tmp/guide-polish-${quick?'quick':'full'}-${width}-${theme}.png`});
   }
  }
  if(quick){await ready(page);if(width<=1100){
    assert(await page.locator('.guide-viewer').evaluate(el=>el.offsetHeight<=innerHeight/3+3));
    // Use a longer lesson so short-page scroll limits don't prevent the overlap.
    if(!await contents.evaluate(el=>el.open))await summary.click();
    await page.locator('.guide-topics [data-guide-lesson="find"]').click();await ready(page);
    // Positioned step numbers must scroll under the sticky viewer, never over it.
    const overlap=await page.evaluate(()=>{
     const viewer=document.querySelector('.guide-layout > .guide-viewer'),number=document.querySelector('[data-guide-section]:not([hidden]) .guide-step-number');
     const stickyTop=parseFloat(getComputedStyle(viewer).top);
     window.scrollBy({top:number.getBoundingClientRect().top+12-(stickyTop+viewer.offsetHeight/2),behavior:'instant'});
     const n=number.getBoundingClientRect(),v=viewer.getBoundingClientRect(),header=document.querySelector('.site-header--guide').getBoundingClientRect();
     return {gap:v.top-header.bottom,covered:viewer.contains(document.elementFromPoint(n.x+n.width/2,n.y+n.height/2)),fade:getComputedStyle(viewer,'::after').backgroundImage,isolated:getComputedStyle(document.querySelector('.guide-layout > .guide-article')).isolation};
    });
    assert(overlap.gap>=12&&overlap.gap<14,`Sticky mockup clears the navbar: ${JSON.stringify(overlap)}`);
    assert.equal(overlap.covered,true,'Step numbers stay underneath the viewer');
    assert.equal(overlap.isolated,'isolate');assert(overlap.fade.includes('linear-gradient'));
   }}
  else{assert.equal(await page.locator('dialog[open]').count(),0);await page.locator('[data-guide-demo="eq/band"]').click();await ready(page);assert.equal(await page.locator('dialog[open]').count(),1);await page.keyboard.press('Escape');}
  await page.keyboard.press('Alt+Shift+KeyK');assert.equal(await page.locator('html').getAttribute('data-keyboard-navigation'),'on');
  if(width<=1100){await page.locator('.guide-mode-links a').last().focus();await page.keyboard.press('Tab');assert.equal(await summary.evaluate(el=>el===document.activeElement),true);assert.equal(await summary.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');await page.keyboard.press('Enter');assert.equal(await contents.evaluate(el=>el.open),true);}
  assert.deepEqual(errors,[]);await page.close();
 }
 assert(Math.abs(measures[0].x-measures[1].x)<1&&Math.abs(measures[0].y-measures[1].y)<1&&Math.abs(measures[0].width-measures[1].width)<1,'Both guide shells align');
 console.log(`${width}x${height}: aligned page navigation, responsive contents, themes, focus, links and viewer bounds passed`);
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
