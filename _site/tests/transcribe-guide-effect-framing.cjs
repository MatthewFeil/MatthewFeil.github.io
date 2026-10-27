const {assert,base,launch,ready,freeze}=require('./transcribe-guide-test-helpers.cjs');
async function fullView(page){
 const m=await page.evaluate(()=>{
  const camera=document.getElementById('guide-camera'),app=document.querySelector('[data-guide-mockup]'),matrix=new DOMMatrixReadOnly(getComputedStyle(document.getElementById('guide-stage')).transform);
  const r=app.getBoundingClientRect(),c=camera.getBoundingClientRect();
  return {scale:matrix.a,fit:Math.min(camera.clientWidth/app.offsetWidth,camera.clientHeight/app.offsetHeight),inside:r.left>=c.left-1&&r.right<=c.right+1&&r.top>=c.top-1&&r.bottom<=c.bottom+1};
 });assert(Math.abs(m.scale-m.fit)<.001,'Effect uses the full app fit');assert(m.inside,'Affected surfaces stay inside the camera');
}
(async()=>{const browser=await launch();try{for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'#timeline/zoom');await ready(page);await fullView(page);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-guide-playback]').click();
 await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='dragging');await fullView(page);
 const before=await page.locator('#transcribe-waveform').evaluate(el=>el.toDataURL());await page.waitForTimeout(200);
 assert.notEqual(await page.locator('#transcribe-waveform').evaluate(el=>el.toDataURL()),before,'Waveform changes while zoom is dragged');
 assert.equal(await page.locator('#guide-camera').getAttribute('data-demo-view'),'context');await freeze(page);
 await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'reduce'});
 for(const key of ['transport/start','speed/speed','sound/controls','measures/go']){
  await page.evaluate(key=>location.hash=key,key);await page.waitForFunction(key=>document.getElementById('guide-camera').dataset.step===key.split('/')[1]&&document.getElementById('guide-camera').dataset.demoPhase==='static',key);await fullView(page);await page.keyboard.press('Escape');
 }
 assert.deepEqual(errors,[]);console.log(`${width}x${height}: timeline zoom effect stays visible during drag, pause works, related actions retain context`);await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
