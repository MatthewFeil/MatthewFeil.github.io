// Real ONNX inference on a downscaled labeled robin photo; synthetic distance, not physical range.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
const base=process.env.BIRDS_MODEL_URL || 'http://127.0.0.1:4001';
if(!process.env.BIRDS_ROBIN_PHOTO)throw new Error('Set BIRDS_ROBIN_PHOTO to the labeled robin image.');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try {
 const page=await browser.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
 if(process.env.BIRDS_BASELINE_WORKER)await page.route('**/assets/js/birds-baseline-worker.mjs',r=>r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.BIRDS_BASELINE_WORKER,'utf8')}));
 await page.goto(base+'/birds/');
 const results=await page.evaluate(async({photo,baseline})=>{
  const image=new Image();image.src='data:image/jpeg;base64,'+photo;await image.decode();
  const result=[];
  for(const variant of (baseline?['baseline','distance']:['distance'])) {
   for(const fixture of [{size:160,x:1050,y:410},{size:96,x:1050,y:410},{size:72,x:350,y:620},{size:0,x:0,y:0}]) {
   const worker=new Worker('/assets/js/'+(variant==='baseline'?'birds-baseline-worker.mjs':'birds-worker.mjs?v=20261006-responsive1'),{type:'module'});
   const next=type=>new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Timeout '+variant+' '+type)),90000);
    worker.onmessage=({data})=>{if(data.type==='error') {clearTimeout(timeout);reject(new Error(data.message));}else if(data.type===type){clearTimeout(timeout);resolve(data);}};
    worker.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message));};
   });
   let promise=next('ready');worker.postMessage({type:'init',option:'detect'});await promise;
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;const ctx=canvas.getContext('2d');ctx.fillStyle='#888';ctx.fillRect(0,0,1920,1080);
    if(fixture.size)ctx.drawImage(image,fixture.x,fixture.y,fixture.size,fixture.size);
    let hits=0,latencies=[],boxes=[];
    for(let i=0;i<(variant==='baseline'?1:36);i++) {
     const bitmap=await createImageBitmap(canvas);promise=next('result');worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);const data=await promise;
     const matches=data.detections.filter(d=>{const cx=(d.box[0]+d.box[2])*960,cy=(d.box[1]+d.box[3])*540;return fixture.size&&cx>=fixture.x&&cx<=fixture.x+fixture.size&&cy>=fixture.y&&cy<=fixture.y+fixture.size;});
     if(matches.length)hits++;latencies.push(data.latencyMs);boxes=data.detections;
    }
    result.push({variant,...fixture,hits,frames:latencies.length,meanMs:Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length),lastBoxes:boxes});
   worker.terminate();
   }
  }
  return result;
 },{photo:fs.readFileSync(process.env.BIRDS_ROBIN_PHOTO).toString('base64'),baseline:!!process.env.BIRDS_BASELINE_WORKER});
 console.log(JSON.stringify({results,errors,remote:requests.filter(r=>!r.url.startsWith(base+'/')),uploads:requests.filter(r=>r.method!=='GET')},null,2));
 if(process.env.BIRDS_DISTANCE_REPORT)fs.writeFileSync(process.env.BIRDS_DISTANCE_REPORT,JSON.stringify(results,null,2));
 assert.deepEqual(errors,[]);assert.ok(results.filter(r=>r.variant==='distance'&&r.size>0).every(r=>r.hits>0),'Distance scans must find each small robin fixture');
 if(process.env.BIRDS_BASELINE_WORKER)assert.ok(results.some(r=>r.variant==='distance'&&r.hits>0&&results.find(b=>b.variant==='baseline'&&b.size===r.size).hits===0));
 assert.ok(requests.every(r=>r.method==='GET'&&r.url.startsWith(base+'/')));
 assert.ok(results.filter(r=>r.size===0).every(r=>r.lastBoxes.length===0));
 assert.ok(results.filter(r=>r.variant==='distance'&&r.size>0).every(r=>r.lastBoxes.length===1),'Overlapping scans must leave one outline per robin');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
