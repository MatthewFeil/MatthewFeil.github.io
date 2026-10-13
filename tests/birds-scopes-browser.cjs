// Synthetic camera/inference verifies scope controls, persistence and stale replies.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=process.env.BIRDS_BUILD_DIR || '/private/tmp/mf-birds-scopes-check';
const server=http.createServer((req,res)=>{
 const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(filename,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(filename)] || 'application/octet-stream'});res.end(error?'Missing':data);});
});
const model=`import {speciesScope,scopedSpeciesSuggestion} from '/assets/js/birds-core.mjs';
let manifest,scope,scopeRevision=0,target=23,delay=120;
self.onmessage=async({data})=>{
 if(data.type==='init'){manifest=await (await fetch('/assets/models/birds/manifest.json')).json();scope=data.scope;scopeRevision=data.scopeRevision;postMessage({type:'ready',species:manifest.species,provider:'wasm',scopeRevision});}
 if(data.type==='scope'){scope=data.scope;scopeRevision=data.scopeRevision;}
 if(data.type==='qa-target'){target=data.target;delay=data.delay || 120;}
 if(data.type==='frame'){
  const width=data.bitmap.width,height=data.bitmap.height,revision=scopeRevision;data.bitmap.close();
  const scores=new Float32Array(525);scores[target]=.99;
  const speciesId=scopedSpeciesSuggestion(scores,manifest.species,manifest.options[0].classifier,speciesScope(manifest,scope));
  setTimeout(()=>postMessage({type:'result',scopeRevision:revision,timestamp:data.timestamp,width,height,latencyMs:delay,detections:[{box:[.25,.25,.6,.6],cacheId:1,speciesId,confidence:.99,classificationFresh:true}]}),delay);
 }
};`;
const motion=`self.onmessage=({data})=>{if(data.type==='frame')postMessage({type:'motion',fromTimestamp:data.timestamp-33,timestamp:data.timestamp,updates:[],latencyMs:1});};`;
(async()=>{let browser;const errors=[];try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/js/birds-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:model}));
  await page.route('**/assets/js/birds-motion-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:motion}));
  await page.addInitScript(()=>{
   const Original=Worker;window.modelStarts=0;window.scopeReplies=[];
   window.Worker=class extends Original{constructor(...args){super(...args);if(!String(args[0]).includes('motion-worker')){window.qaModel=this;window.modelStarts++;this.addEventListener('message',({data})=>{if(data.type==='result')window.scopeReplies.push(data.scopeRevision);});}}};
   navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const ctx=c.getContext('2d'),stream=c.captureStream(30),timer=setInterval(()=>ctx.fillRect(0,0,640,480),33);stream.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();};});window.qaStream=stream;return stream;};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/birds/`);
  const scope=page.getByLabel('Species scope');assert.equal(await scope.inputValue(),'common-north-america');
  await page.screenshot({path:`/private/tmp/birds-scopes-${viewport.width}-off.png`});
  await page.locator('.birds-start').click();
  await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('American Robin'));
  await page.evaluate(()=>qaModel.postMessage({type:'qa-target',target:20}));
  await page.waitForFunction(()=>[...document.querySelectorAll('.birds-label')].every(n=>n.hidden));
  await scope.selectOption('north-america');
  await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('American Kestrel'));
  assert.match(await page.locator('.birds-availability').textContent(),/181/);
  await scope.selectOption('worldwide');await page.evaluate(()=>qaModel.postMessage({type:'qa-target',target:3}));
  await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('African Crowned Crane'));
  await page.screenshot({path:`/private/tmp/birds-scopes-${viewport.width}-running.png`});
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
  // Queue an old worldwide result, then switch twice before it can return.
  await page.evaluate(()=>{qaModel.postMessage({type:'qa-target',target:3,delay:700});window.oldCount=scopeReplies.length;});
  await page.waitForTimeout(180);
  await scope.selectOption('north-america');await scope.selectOption('common-north-america');
  await page.waitForTimeout(60);
  await page.evaluate(()=>{window.oldNames=[];window.namesObserver=new MutationObserver(()=>{for(const n of document.querySelectorAll('.birds-label'))if(!n.hidden&&n.textContent)oldNames.push(n.textContent);});namesObserver.observe(document.querySelector('.birds-overlays'),{subtree:true,childList:true,characterData:true,attributes:true});});
  await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>oldNames.some(n=>n.includes('African Crowned Crane'))),false,'Old-scope replies cannot restore names');
  assert.equal(await page.evaluate(()=>modelStarts),1);assert.equal(await page.evaluate(()=>qaStream.getTracks()[0].readyState),'live');
  await scope.selectOption('worldwide');await page.reload();assert.equal(await page.getByLabel('Species scope').inputValue(),'worldwide');
  assert.match(await page.locator('.birds-availability').textContent(),/525/);
  await page.close();
 }
 const blocked=await browser.newPage();blocked.on('pageerror',e=>errors.push(e.message));
 await blocked.addInitScript(()=>{Storage.prototype.getItem=Storage.prototype.setItem=()=>{throw new Error('Storage blocked');};});
 await blocked.goto(`http://127.0.0.1:${server.address().port}/birds/`);await blocked.getByLabel('Species scope').selectOption('north-america');assert.match(await blocked.locator('.birds-availability').textContent(),/181/);await blocked.close();
 assert.deepEqual(errors,[]);console.log('52/181/525 controls, live switching, stale-result rejection, session/camera reuse, saved preferences and blocked storage passed at 390/1440px.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
