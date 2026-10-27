const {assert,base,launch}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{
 for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.waitForFunction(()=>document.querySelector('#guide-demo-article section'));
  for(const theme of ['light','dark']){
   await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const opening=await page.evaluate(async()=>{
    document.querySelector('[data-guide-demo="eq/band"]').click();
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const d=document.querySelector('dialog');return {open:d.open,moving:d.getAnimations().some(a=>a.transitionProperty==='opacity')};
   });assert.equal(opening.open,true);assert.equal(opening.moving,true,'Entrance fades the native modal');
   await page.waitForTimeout(270);
   const dialog=page.locator('dialog'),box=await dialog.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
   if(theme==='light'&&(width===1440||width===390))await page.screenshot({path:`/private/tmp/guide-dialog-motion-${width}.png`});
   await page.keyboard.press('Escape');
   assert.equal(await dialog.evaluate(el=>el.open),false);
   assert.equal(await page.locator('#guide-camera').getAttribute('data-demo-phase'),'none');
   assert.equal(await page.locator('[data-guide-demo="eq/band"]').evaluate(el=>el===document.activeElement),true);
   assert(await dialog.evaluate(el=>getComputedStyle(el).display!=='none'),'Exit remains rendered after semantic dismissal');
   // Reopen before exit finishes: no stale close may dismiss the new lesson.
   await page.evaluate(()=>document.querySelector('[data-guide-demo="stems/mute"]').click());
   await page.waitForTimeout(270);assert.equal(await dialog.evaluate(el=>el.open),true);
   await page.locator('[data-guide-close]').click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('dialog')).display==='none',{},{timeout:1500});assert.equal(await dialog.isVisible(),false);
   assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('guide-dialog-open')),false);
  }
  // Backdrop dismissal follows the same exit path.
  await page.evaluate(()=>document.querySelector('[data-guide-demo="eq/band"]').click());await page.waitForTimeout(270);
  await page.mouse.click(2,2);await page.waitForFunction(()=>getComputedStyle(document.querySelector('dialog')).display==='none',{},{timeout:1500});assert.equal(await page.locator('dialog').isVisible(),false);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>document.querySelector('[data-guide-demo="eq/band"]').click());
  assert.equal(await page.locator('dialog').evaluate(el=>el.getAnimations().length),0);
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').isVisible(),false);
  assert.deepEqual(errors,[]);console.log(`${width}x${height}: entrance, exit, rapid reopen, dismissal, focus and reduced motion passed`);await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
