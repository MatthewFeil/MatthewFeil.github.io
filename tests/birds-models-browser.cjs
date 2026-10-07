// Real inference on a labeled photo, injected as a synthetic camera feed. Not physical-phone evidence.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const fs=require('fs');
const assert=require('node:assert/strict');
const base=process.env.BIRDS_MODEL_URL || 'http://127.0.0.1:4001';
if(!process.env.BIRDS_ROBIN_PHOTO) throw new Error('Set BIRDS_ROBIN_PHOTO to a labeled local robin photograph.');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
  const photo=fs.readFileSync(process.env.BIRDS_ROBIN_PHOTO).toString('base64');
  await page.addInitScript(photo=>{
    navigator.mediaDevices.getUserMedia=async()=>{
      const image=new Image();image.src='data:image/jpeg;base64,'+photo;await image.decode();
      const c=document.createElement('canvas');c.width=640;c.height=640;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,640,640);
      const stream=c.captureStream(5);const tick=setInterval(()=>ctx.drawImage(image,0,0,640,640),200);
      stream.getTracks().forEach(track=>{const stop=track.stop.bind(track);track.stop=()=>{clearInterval(tick);stop();};});
      return stream;
    };
  },photo);
  await page.goto(base+'/birds/');
  await page.locator('.birds-start').click();
  await page.waitForFunction(()=>document.body.classList.contains('birds-running'));
  const results=[];
  for(const id of ['small','full','detect']) {
    await page.locator('#birds-model').selectOption(id);
    await page.waitForFunction(()=>document.querySelector('.birds-timing').textContent.includes('analysis') || document.querySelector('.birds-status').textContent.startsWith('Camera only'),{},{timeout:90000});
    await page.waitForTimeout(2000);
    const status=await page.locator('.birds-status').textContent();
    const labels=await page.locator('.birds-label').allTextContents();
    const entry={id,status,labels,timing:await page.locator('.birds-timing').textContent()};results.push(entry);console.log(JSON.stringify(entry));
    if(process.env.BIRDS_SCREENSHOT_DIR) {fs.mkdirSync(process.env.BIRDS_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:process.env.BIRDS_SCREENSHOT_DIR+'/'+id+'-390.png'});}
    assert.ok(!status.startsWith('Camera only'),'Model session must run real inference');
    if(id==='full') assert.ok(labels.some(label=>label.includes('American Robin')));
    if(id==='detect') assert.ok(labels.includes('Bird'));
  }
  await page.locator('.birds-stop').click();
  assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);
  assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET' && r.url.startsWith(base+'/')));
  console.log(JSON.stringify({results,errors,remoteRequests:requests.filter(r=>!r.url.startsWith(base+'/')),uploads:requests.filter(r=>r.method!=='GET')},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
