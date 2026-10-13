// Layout checks use synthetic frames/species; they do not validate phone inference.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root=process.env.BIRDS_BUILD_DIR || '/private/tmp/mf-birds-check';
const server=http.createServer((req,res)=>{
  const filename=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!filename.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(filename,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'})[path.extname(filename)] || 'application/octet-stream'});res.end(error?'Missing':data);});
});
const model=`let box=[.01,.01,.4,.2];self.onmessage=({data})=>{
 if(data.type==='qa-box')box=data.box;
 if(data.type==='init')postMessage({type:'ready',provider:'wasm',species:[{id:'bird',commonName:'Northern Rough-winged Swallow'}]});
 if(data.type==='frame'){const width=data.bitmap.width,height=data.bitmap.height;data.bitmap.close();postMessage({type:'result',timestamp:data.timestamp,width,height,latencyMs:20,detections:[{box,cacheId:1,speciesId:'bird',confidence:.98,classificationFresh:true}]});}
};`;
const motion=`self.onmessage=({data})=>{if(data.type==='frame')postMessage({type:'motion',fromTimestamp:data.timestamp-33,timestamp:data.timestamp,updates:[],latencyMs:1});};`;
(async()=>{let browser;const reports=[],errors=[];try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 for(const [width,height] of [[280,568],[320,568],[390,844],[393,852],[568,320],[844,390],[768,1024],[1440,900],[3840,2160]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/assets/js/birds-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:model}));
  await page.route('**/assets/js/birds-motion-worker.mjs?*',r=>r.fulfill({contentType:'text/javascript',body:motion}));
  await page.addInitScript(()=>{
   const Original=Worker;window.Worker=class extends Original{constructor(...args){super(...args);if(!String(args[0]).includes('motion-worker')){window.qaModel=this;const post=this.postMessage.bind(this);this.postMessage=(data,...rest)=>{if(data.type==='init'){window.resumeModel=()=>post(data,...rest);return;}post(data,...rest);};}}};
   navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=innerWidth;c.height=innerHeight;const x=c.getContext('2d');const stream=c.captureStream(30),timer=setInterval(()=>x.fillRect(0,0,c.width,c.height),33);stream.getTracks().forEach(t=>{const stop=t.stop.bind(t);t.stop=()=>{clearInterval(timer);stop();};});return stream;};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/birds/`);
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false,JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.body.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(n=>n.getBoundingClientRect().right>innerWidth+1).map(n=>({tag:n.tagName,cls:n.className,right:n.getBoundingClientRect().right})).slice(0,15)}))));
  await page.locator('.birds-start').click();await page.locator('.birds-loading').waitFor();await page.waitForFunction(()=>document.querySelector('.birds-loading').getBoundingClientRect().bottom<=document.querySelector('.birds-toolbar').getBoundingClientRect().top+.5);
  const loading=await page.locator('.birds-loading').evaluate(n=>({overflow:n.scrollWidth>n.clientWidth,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom,toolbarTop:document.querySelector('.birds-toolbar').getBoundingClientRect().top}));assert.equal(loading.overflow,false);assert.ok(loading.bottom<=loading.toolbarTop+.5);
  await page.evaluate(()=>resumeModel());await page.waitForFunction(()=>document.querySelector('.birds-label')?.textContent.includes('Swallow'));
  async function checkLabel(){await page.waitForTimeout(100);return page.evaluate(()=>{
   const l=document.querySelector('.birds-label:not([hidden])'),r=l.getBoundingClientRect(),bar=document.querySelector('.birds-toolbar').getBoundingClientRect();
   return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,toolbarTop:bar.top,overflow:l.scrollWidth>l.clientWidth || l.scrollHeight>l.clientHeight,text:l.textContent};
  });}
  let label=await checkLabel();assert.ok(label.left>=7 && label.right<=width-7 && label.top>=7 && label.bottom<=label.toolbarTop-7,JSON.stringify(label));assert.equal(label.overflow,false);assert.ok(label.text.endsWith('5/5'));
  await page.evaluate(()=>qaModel.postMessage({type:'qa-box',box:[.8,.5,.99,.7]}));await page.waitForTimeout(700);
  label=await checkLabel();assert.ok(label.left>=7 && label.right<=width-7 && label.bottom<=label.toolbarTop-7,JSON.stringify(label));assert.equal(label.overflow,false);
  // Full longest live instruction should wrap; the stats line remains swipeable.
  await page.evaluate(()=>{document.querySelector('.birds-status').textContent='Hold steady · Identifying';});
  const status=await page.locator('.birds-status').evaluate(n=>({overflow:n.scrollWidth>n.clientWidth,textOverflow:getComputedStyle(n).textOverflow}));assert.equal(status.overflow,false);
  await page.waitForFunction(()=>document.querySelector('.birds-timing').textContent.startsWith('analysis:'));
  const normalHeight=(await page.locator('.birds-toolbar').boundingBox()).height;
  if(width===320 || width===568){
   // Keep the target in the remaining camera area when text enlarges the toolbar.
   await page.evaluate(()=>qaModel.postMessage({type:'qa-box',box:[.4,.25,.6,.4]}));await page.waitForTimeout(700);
   await page.addStyleTag({content:':root {font-size:32px!important;}'});
   await page.waitForTimeout(200);label=await checkLabel();assert.ok(label.left>=15 && label.right<=width-15 && label.bottom<=label.toolbarTop-15,JSON.stringify(label));assert.equal(label.overflow,false);
   const stats=await page.locator('.birds-stats').evaluate(n=>({height:n.clientHeight,scrollHeight:n.scrollHeight}));assert.ok(stats.height>=stats.scrollHeight-1,JSON.stringify(stats));
   const scope=await page.locator('.birds-scope').boundingBox();assert.ok(scope.x>=0 && scope.x+scope.width<=width && scope.y+scope.height<=height,'Scope stays inside the viewport at large text sizes');
   await page.addStyleTag({content:':root {font-size:16px!important;}'});
  }
  // Insets emulate the geometry of a landscape notch and home indicator.
  if(width===844){await page.addStyleTag({content:'.birds-overlays {padding:24px 44px 8px!important;} .birds-toolbar {padding-left:44px!important;padding-right:44px!important;padding-bottom:24px!important;}'});await page.waitForTimeout(200);label=await checkLabel();assert.ok(label.left>=44 && label.right<=width-44 && label.top>=24,JSON.stringify(label));}
  if(process.env.BIRDS_SCREENSHOT_DIR){fs.mkdirSync(process.env.BIRDS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.BIRDS_SCREENSHOT_DIR,`camera-${width}.png`)});}
  if(width===390){await page.evaluate(()=>qaModel.postMessage({type:'qa-box',box:[.4,.4,.6,.6]}));await page.waitForTimeout(500);await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);const rotated=await checkLabel();assert.ok(rotated.left>=7 && rotated.right<=837 && rotated.top>=7 && rotated.bottom<=rotated.toolbarTop-7,JSON.stringify(rotated));}
  reports.push({width,height,normalToolbarHeight:normalHeight,label});await page.locator('.birds-stop').click();await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({viewports:reports,errors},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
