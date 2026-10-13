// Synthetic faults verify recovery/lifecycle, not real-camera recognition quality.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=process.env.BIRDS_BUILD_DIR || '/private/tmp/mf-birds-check';
const server=http.createServer((req,res)=>{
  const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(filename)] || 'application/octet-stream'});res.end(error?'Missing':data);});
});
const model=`self.onmessage=({data})=>{
  if(data.type==='qa-crash')throw Error('Injected worker crash');
  if(data.type==='qa-error')postMessage({type:'error',message:'Local model configuration could not be loaded.'});
  if(data.type==='init')postMessage({type:'ready',provider:'wasm',species:[{id:'robin',commonName:'American Robin'}]});
  if(data.type==='frame'){const width=data.bitmap.width,height=data.bitmap.height;data.bitmap.close();postMessage({type:'result',timestamp:data.timestamp,width,height,latencyMs:50,detections:[{box:[.3,.25,.6,.65],cacheId:1,speciesId:'robin',confidence:.94,classificationFresh:true}]});}
};`;
const motion=`self.onmessage=({data})=>{if(data.type==='frame')postMessage({type:'motion',fromTimestamp:data.timestamp-33,timestamp:data.timestamp,updates:[],latencyMs:1});};`;
(async()=>{let browser;try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
  const errors=[];
  for(const [width,height] of [[320,568],[844,390]]){
    const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/assets/js/birds-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:model}));
    await page.route('**/assets/js/birds-motion-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:motion}));
    await page.addInitScript(()=>{
      window.motionReplies=0;window.motionStarts=0;window.modelReplies=0;
      const Original=Worker;
      window.Worker=class extends Original{constructor(...args){super(...args);const isMotion=String(args[0]).includes('motion-worker');if(isMotion)motionStarts++;else window.qaModel=this;
        const post=this.postMessage.bind(this);this.postMessage=(...values)=>{if(isMotion && window.stallMotion)return;post(...values);};
        this.addEventListener('message',({data})=>{if(data.type==='motion')motionReplies++;if(data.type==='result')modelReplies++;});
      }};
      const read=CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData=function(...args){if(Math.max(this.canvas.width,this.canvas.height)===480 && (window.breakCapture || window.failOnce)){window.failOnce=false;throw Error('Injected capture failure');}return read.apply(this,args);};
      const schedule=setTimeout;window.setTimeout=(fn,delay,...args)=>schedule(fn,window.fastWatchdog && delay===45000?200:delay,...args);
      const capture=createImageBitmap;window.createImageBitmap=(...args)=>window.stallBitmap?new Promise(()=>{}):window.breakBitmap?Promise.reject(Error('Injected bitmap failure')):capture(...args);
      navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');const stream=c.captureStream(30),timer=setInterval(()=>x.fillRect(0,0,640,480),33);stream.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();};});return stream;};
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/birds/`);await page.locator('.birds-start').click();
    await page.waitForFunction(()=>motionReplies>3 && modelReplies>2);
    const toolbarHeight=(await page.locator('.birds-toolbar').boundingBox()).height;
    const initial=await page.evaluate(()=>{window.failOnce=true;return motionStarts;});
    await page.waitForFunction(n=>motionStarts>n && document.querySelector('.birds-warning').hidden,initial);
    await page.evaluate(()=>window.breakCapture=true);
    await page.waitForFunction(()=>document.querySelector('.birds-warning-text').textContent.includes('may move less smoothly'));
    const before=await page.evaluate(()=>modelReplies);await page.waitForFunction(n=>modelReplies>n,before);
    assert.equal((await page.locator('.birds-toolbar').boundingBox()).height,toolbarHeight);
    if(process.env.BIRDS_SCREENSHOT_DIR){fs.mkdirSync(process.env.BIRDS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BIRDS_SCREENSHOT_DIR,`warning-${width}.png`)});}
    const panel=await page.locator('.birds-warning').boundingBox();assert.ok(panel.x>=0 && panel.x+panel.width<=width && panel.y>=0);
    assert.equal(await page.locator('.birds-warning-text').evaluate(n=>n.scrollWidth>n.clientWidth),false);
    await page.evaluate(()=>window.breakCapture=false);await page.locator('.birds-retry').click();await page.waitForFunction(()=>document.querySelector('.birds-warning').hidden && motionReplies>5);
    // A worker that never answers is restarted a bounded number of times.
    await page.evaluate(()=>window.stallMotion=true);
    await page.waitForFunction(()=>document.querySelector('.birds-warning-text').textContent.includes('may move less smoothly'),null,{timeout:15000});
    await page.evaluate(()=>window.stallMotion=false);await page.locator('.birds-retry').click();await page.waitForFunction(()=>document.querySelector('.birds-warning').hidden);
    await page.evaluate(()=>qaModel.postMessage({type:'qa-error'}));await page.waitForFunction(()=>document.querySelector('.birds-status').textContent==='Identification paused');
    assert.ok(await page.locator('.birds-warning-text').textContent().then(t=>t.includes('configuration') && t.includes('still on')));
    assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject.getVideoTracks()[0].readyState),'live');
    await page.locator('.birds-retry').click();await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('American Robin'));
    await page.evaluate(()=>qaModel.postMessage({type:'qa-crash'}));await page.waitForFunction(()=>document.querySelector('.birds-warning-text').textContent.includes('stopped unexpectedly'));
    await page.locator('.birds-retry').click();await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('American Robin'));
    await page.evaluate(()=>{window.stallBitmap=true;window.fastWatchdog=true;});await page.waitForFunction(()=>document.querySelector('.birds-warning-text').textContent.includes('took too long'));
    await page.evaluate(()=>{window.stallBitmap=false;window.fastWatchdog=false;});await page.locator('.birds-retry').click();await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('American Robin'));
    await page.evaluate(()=>window.breakBitmap=true);await page.waitForFunction(()=>document.querySelector('.birds-warning-text').textContent.includes('could not be read'));
    await page.evaluate(()=>window.breakBitmap=false);await page.locator('.birds-retry').click();await page.waitForFunction(()=>document.querySelector('.birds-warning').hidden);
    // Stopping during an automatic motion retry must cancel its delayed restart.
    await page.evaluate(()=>window.breakCapture=true);await page.waitForFunction(()=>!document.querySelector('.birds-warning').hidden);
    await page.locator('.birds-stop').click();const stopped=await page.evaluate(()=>motionStarts);await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(()=>motionStarts),stopped);assert.equal(await page.locator('.birds-warning').isVisible(),false);
    assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log('Recovery passed: transient/persistent capture failures, stalled tracking worker, model failure/crash/retry, stalled and rejected bitmap capture, and stop during retry; compact portrait and landscape.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
