const{assert,base,launch,ready,freeze}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{
 for(const [route,width,first,second] of [['quick-start/#playback/play',1440,'play','pause'],['#pitch/controls',390,'controls','transpose']]){
  const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+route);await ready(page);await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{window.phases=[];const camera=document.getElementById('guide-camera');new MutationObserver(()=>{const phase=camera.dataset.demoPhase,step=camera.dataset.step,last=window.phases.at(-1);if(last?.phase!==phase||last?.step!==step)window.phases.push({phase,step,time:performance.now()});}).observe(camera,{attributes:true,attributeFilter:['data-demo-phase','data-step']});});
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('[data-guide-playback]').click();
  await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='reading');
  await freeze(page); // The new reading hold freezes along with progress and the scene.
  await page.waitForFunction(step=>document.getElementById('guide-camera').dataset.step===step&&document.getElementById('guide-camera').dataset.demoPhase==='reading',second);
  await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='complete',null,{timeout:45000});
  const phases=await page.evaluate(()=>window.phases);
  function span(step,phase){const index=phases.findIndex(p=>p.step===step&&p.phase===phase);assert(index>=0,`${step} has ${phase}`);return phases[index+1].time-phases[index].time;}
  assert(span(first,'reading')>=2200,'First step has an extended reading hold');
  assert(span(second,'reading')>=1000,'Later steps allow reading before the cursor acts');
  assert(span(first,'reviewing')>=1550,'Results stay visible before the next step');
  assert(span(first,'pointing')>=780,'Cursor movement uses the slower shared pace');
  assert.deepEqual(errors,[]);console.log(`${width}px ${route}: longer first/later reading holds, slower cursor, result hold, exact-frame pause and completion passed`);await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
