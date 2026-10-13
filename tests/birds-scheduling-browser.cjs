// Synthetic workers/camera test scheduling and lifecycle, not recognition accuracy.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=process.env.BIRDS_BUILD_DIR || '/private/tmp/mf-birds-scheduling-check';
const server=http.createServer((req,res)=>{
  const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(filename)] || 'application/octet-stream'});res.end(error?'Missing':data);});
});
const model=`let delay=20,visible=false;self.onmessage=({data})=>{
 if(data.type==='qa-mode'){delay=data.delay;visible=data.visible;return;}
 if(data.type==='init')postMessage({type:'ready',provider:'wasm',species:[{id:'robin',commonName:'American Robin'}]});
 if(data.type==='frame'){const width=data.bitmap.width,height=data.bitmap.height;data.bitmap.close();setTimeout(()=>postMessage({type:'result',timestamp:data.timestamp,width,height,latencyMs:delay,detections:visible?[{box:[.3,.25,.6,.65],cacheId:1,speciesId:'robin',confidence:.94,classificationFresh:true}]:[]}),delay);}
};`;
const motion=`let previous=0;self.onmessage=({data})=>{if(data.type==='frame'){postMessage({type:'motion',fromTimestamp:previous,timestamp:data.timestamp,updates:data.tracks.map(t=>({id:t.id,dx:0,dy:0,quality:.95,lost:false})),latencyMs:1});previous=data.timestamp;}};`;
(async()=>{let browser;try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/assets/js/birds-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:model}));
 await page.route('**/assets/js/birds-motion-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:motion}));
 await page.addInitScript(()=>{
  window.motionSamples=[];window.analysisSamples=[];window.maxPending=0;window.analysisPending=0;
  const Original=Worker;window.Worker=class extends Original{constructor(...args){super(...args);const isMotion=String(args[0]).includes('motion-worker');if(!isMotion)window.qaModel=this;
   const post=this.postMessage.bind(this);this.postMessage=(data,...rest)=>{if(data.type==='frame'){if(isMotion)motionSamples.push({at:performance.now(),media:document.querySelector('video').currentTime});else{analysisPending++;maxPending=Math.max(maxPending,analysisPending);}}post(data,...rest);};
   this.addEventListener('message',({data})=>{if(data.type==='result'){analysisPending--;analysisSamples.push(performance.now());}});
  }};
  navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d'),stream=c.captureStream(30);let i=0;const timer=setInterval(()=>{x.fillStyle=i++%2?'#335577':'#446688';x.fillRect(0,0,640,480);},1000/30);stream.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();};});return stream;};
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/birds/`);
 assert.match(await page.title(),/Bird/i);assert.ok(await page.locator('.birds-start').isVisible());
 // Observe actual scheduler mode changes without adding app-facing debug state.
 await page.evaluate(async()=>{const {BirdScheduler}=await import('/assets/js/birds-scheduler.mjs?v=20261013-scheduling1');const observe=BirdScheduler.prototype.observeMotion;BirdScheduler.prototype.observeMotion=function(...args){observe.apply(this,args);window.qaFps=this.motionFps;};});
 await page.click('.birds-start');await page.waitForFunction(()=>analysisSamples.length>=4);
 assert.equal(await page.evaluate(()=>motionSamples.length),0,'Searching does not run motion pyramids');
 await page.evaluate(()=>qaModel.postMessage({type:'qa-mode',delay:20,visible:true}));
 await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('American Robin'));
 await page.waitForTimeout(800);
 const measure=async()=>{await page.evaluate(()=>{motionSamples=[];analysisSamples=[];});await page.waitForTimeout(4000);return page.evaluate(()=>({fps:motionSamples.length/4,ai:analysisSamples.length/4,target:qaFps,unique:new Set(motionSamples.map(s=>s.media)).size===motionSamples.length}));};
 const normal=await measure();assert.equal(normal.target,30);assert.ok(normal.fps>=27 && normal.fps<=31,JSON.stringify(normal));assert.ok(normal.ai>=2 && normal.ai<=3,JSON.stringify(normal));assert.ok(normal.unique);
 await page.evaluate(()=>qaModel.postMessage({type:'qa-mode',delay:380,visible:true}));await page.waitForFunction(()=>qaFps===24,null,{timeout:15000});
 const pressure=await measure();assert.equal(pressure.target,24);assert.ok(pressure.fps>=22 && pressure.fps<=26,JSON.stringify(pressure));assert.ok(pressure.ai>=.75);assert.ok(pressure.unique);assert.equal(await page.evaluate(()=>maxPending),1);
 await page.evaluate(()=>qaModel.postMessage({type:'qa-mode',delay:20,visible:true}));await page.waitForFunction(()=>qaFps===30,null,{timeout:20000});
 assert.ok(await page.locator('.birds-label').textContent().then(t=>t.includes('American Robin')));
 if(process.env.BIRDS_SCREENSHOT_DIR){fs.mkdirSync(process.env.BIRDS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BIRDS_SCREENSHOT_DIR,'scheduler-390.png')});}
 await page.click('.birds-stop');const count=await page.evaluate(()=>motionSamples.length);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>motionSamples.length),count);assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);
 await page.click('.birds-start');await page.waitForFunction(()=>analysisSamples.length>0 && document.querySelector('.birds-status').textContent==='Aim at a bird');
 await page.evaluate(()=>qaModel.postMessage({type:'qa-mode',delay:20,visible:true}));await page.waitForFunction(()=>qaFps===30 && document.querySelector('.birds-label')?.textContent.includes('American Robin'));await page.click('.birds-stop');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({normal,pressure,recovery:30,searchMotion:'idle',maxPending:1,errors},null,2));
 }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
