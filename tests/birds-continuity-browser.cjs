// Real local models and a moving photo camera, with an injected detector outage.
// The outage removes detections; it never inserts simulated bird detections.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const base=process.env.BIRDS_MODEL_URL || 'http://127.0.0.1:4001';
if(!process.env.BIRDS_ROBIN_PHOTO)throw Error('Set BIRDS_ROBIN_PHOTO to a labeled robin photo.');
const baseline=process.env.BIRDS_TRACKING_BASELINE==='1';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try{
  const page=await browser.newPage({viewport:{width:960,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(baseline)for(const file of ['birds.js','birds-core.mjs']){
   await page.route('**/assets/js/'+file+'?*',r=>r.fulfill({contentType:'text/javascript',body:execFileSync('git',['show','HEAD:assets/js/'+file],{encoding:'utf8'})}));
  }
  await page.route('**/assets/js/birds-worker.mjs?*',async route=>{
   const source=baseline?execFileSync('git',['show','HEAD:assets/js/birds-worker.mjs'],{encoding:'utf8'}):fs.readFileSync('assets/js/birds-worker.mjs','utf8');
   const fault="let testDetectorGapUntil=0;self.addEventListener('message',({data})=>{if(data.type==='test-detector-gap')testDetectorGapUntil=performance.now()+data.duration;});\n";
   await route.fulfill({contentType:'text/javascript',body:fault+source.replace('async function detect(bitmap,window) {','async function detect(bitmap,window) {\n if(performance.now()<testDetectorGapUntil)return [];')});
  });
  await page.addInitScript(photo=>{
   window.moving=false;window.visibleBird=true;window.emptyAIResults=0;window.freshIDs=0;
   const Original=Worker;
   window.Worker=class extends Original{
    constructor(...args){super(...args);if(String(args[0]).includes('birds-worker.mjs')){
     window.modelWorker=this;this.addEventListener('message',({data})=>{if(data.type==='result'){if(!data.detections.length)emptyAIResults++;freshIDs+=data.detections.filter(d=>d.classificationFresh).length;}});
    }}
   };
   navigator.mediaDevices.getUserMedia=async()=>{
    const image=new Image();image.src='data:image/jpeg;base64,'+photo;await image.decode();
    const c=document.createElement('canvas');c.width=960;c.height=720;const ctx=c.getContext('2d'),start=performance.now();
    function draw(){const t=(performance.now()-start)/1000,dx=moving?120*Math.sin(t*1.8):0,dy=moving?45*Math.sin(t*1.4):0;window.cameraOffset=[dx,dy];ctx.fillStyle='#888';ctx.fillRect(0,0,960,720);if(visibleBird)ctx.drawImage(image,240+dx,120+dy,480,480);}
    draw();const tick=setInterval(draw,33),stream=c.captureStream(30);
    stream.getTracks().forEach(track=>{const stop=track.stop.bind(track);track.stop=()=>{clearInterval(tick);stop();};});return stream;
   };
  },fs.readFileSync(process.env.BIRDS_ROBIN_PHOTO).toString('base64'));
  await page.goto(base+'/birds/');await page.selectOption('#birds-model','small');await page.click('.birds-start');
  await page.waitForFunction(()=>[...document.querySelectorAll('.birds-label')].some(n=>n.textContent.includes('American Robin')),null,{timeout:90000});
  await page.evaluate(()=>{firstBox=document.querySelector('.birds-box');const r=firstBox.getBoundingClientRect();initialCenter=[r.x+r.width/2,r.y+r.height/2];moving=true;freshIDs=0;});
  await page.waitForTimeout(500);
  await page.evaluate(()=>modelWorker.postMessage({type:'test-detector-gap',duration:2200}));
  const samples=[];
  for(let i=0;i<34;i++){
   await page.waitForTimeout(100);
   samples.push(await page.evaluate(()=>{const box=document.querySelector('.birds-box'),r=box?.getBoundingClientRect();return {count:document.querySelectorAll('.birds-box').length,same:box===firstBox,named:document.querySelector('.birds-label')?.textContent.includes('American Robin')||false,error:r?Math.hypot(r.x+r.width/2-initialCenter[0]-cameraOffset[0],r.y+r.height/2-initialCenter[1]-cameraOffset[1]):null};}));
  }
  const metrics=await page.evaluate(()=>({emptyAIResults,freshIDs}));
  const report={baseline,...metrics,samples:samples.length,same:samples.filter(s=>s.same).length,named:samples.filter(s=>s.named).length,maxError:Math.max(...samples.map(s=>s.error||0)),errors};
  console.log(JSON.stringify(report,null,2));
  if(process.env.BIRDS_CONTINUITY_REPORT)fs.writeFileSync(process.env.BIRDS_CONTINUITY_REPORT,JSON.stringify(report,null,2));
  await page.evaluate(()=>visibleBird=false);await page.waitForTimeout(1700);
  assert.equal(await page.locator('.birds-box').count(),0,'Remove outline when bird leaves');
  assert.deepEqual(errors,[]);assert.ok(metrics.emptyAIResults>=4,'Exercise sustained actual detector misses');
  if(!baseline){assert.ok(report.same>=32,'Maintain the same outline through detector outage');assert.ok(report.named>=32,'Retain the established name');assert.ok(report.maxError<65,'Follow bird movement during detector outage');assert.ok(report.freshIDs<=2,'Do not restart species identification after detector gap');}
  await page.click('.birds-stop');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
