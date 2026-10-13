// Production build required. A temporary local server is closed even on failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const root = process.env.BIRDS_BUILD_DIR || '/private/tmp/mf-birds-check';
const screenshots = process.env.BIRDS_SCREENSHOT_DIR;
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2'};
const server = http.createServer((req,res) => {
  const filename = path.resolve(root, '.' + new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filename, (error,data) => { res.writeHead(error?404:200, {'Content-Type':types[path.extname(filename)]||'application/octet-stream'}); res.end(error?'Missing':data); });
});
(async () => {
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH, args:['--use-fake-device-for-media-stream']});
    const errors=[],requests=[];
    for (const [width,height] of [[390,844],[320,568],[844,390],[1440,900]]) {
      const context=await browser.newContext({viewport:{width,height}, permissions:['camera'],colorScheme:'dark'});
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',req=>requests.push({url:req.url(),method:req.method(),body:!!req.postData()}));
      await page.route('**/assets/models/birds/manifest.json',route=>route.fulfill({json:{experimental:{enabled:false},options:[]}}));
      await page.goto(origin+'/birds/');
      await page.locator('.birds-start').waitFor();
      assert.match(await page.locator('.birds-availability').textContent(),/Experimental/);
      assert.equal(await page.locator('.birds-toolbar').isVisible(),true);
      assert.equal(await page.locator('.birds-stop').textContent(),'Start camera');
      assert.equal(await page.locator('.birds-stop').getAttribute('aria-pressed'),'false');
      assert.equal(await page.locator('.site-header').isVisible(),false);
      assert.equal(await page.locator('.site-footer').isVisible(),false);
      const idleDimensions=await page.locator('.birds-stage').boundingBox();
      assert.equal(idleDimensions.x,0);assert.equal(idleDimensions.y,0);
      assert.equal(idleDimensions.width,width);assert.equal(idleDimensions.height,height);
      assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
      if(screenshots){fs.mkdirSync(screenshots,{recursive:true});await page.screenshot({path:path.join(screenshots,`idle-${width}.png`),fullPage:true});}
      await page.locator('.birds-start').click();
      await page.waitForFunction(()=>document.body.classList.contains('birds-running'));
      await page.waitForFunction(()=>document.querySelector('.birds-warning-text').textContent.includes('disabled'));
      assert.equal(await page.locator('.birds-overlays').locator('*').count(),0);
      assert.equal(await page.locator('.site-header').isVisible(),false);
      const dimensions=await page.locator('.birds-stage').boundingBox();
      assert.equal(dimensions.width,width);assert.equal(dimensions.height,height);
      const stop=await page.locator('.birds-stop').boundingBox();assert.ok(stop.height>=44 && stop.x+stop.width<=width && stop.y+stop.height<=height);
      if(screenshots)await page.screenshot({path:path.join(screenshots,`camera-${width}.png`)});
      await page.locator('.birds-stop').click();
      assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);
      assert.equal(await page.locator('.site-header').isVisible(),false);
      assert.equal(await page.locator('.site-footer').isVisible(),false);
      assert.equal(await page.locator('.birds-start').isVisible(),true);
      assert.equal(await page.locator('.birds-stop').textContent(),'Start camera');
      await page.locator('.birds-stop').click();
      await page.waitForFunction(()=>document.body.classList.contains('birds-running'));
      assert.equal(await page.locator('.birds-stop').textContent(),'Stop camera');
      assert.equal(await page.locator('.birds-stop').getAttribute('aria-pressed'),'true');
      await page.evaluate(()=>document.querySelector('video').srcObject.getVideoTracks()[0].dispatchEvent(new Event('ended')));
      await page.waitForFunction(()=>document.querySelector('.birds-start').textContent==='Resume camera');
      assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject),null);
      assert.equal(await page.locator('.birds-stop').textContent(),'Start camera');
      assert.equal(await page.locator('.birds-toolbar').isVisible(),true);
      await context.close();
    }
    // Permission refusal is a recoverable state, not an immersive screen with no camera.
    const denied=await browser.newContext();const page=await denied.newPage();
    await page.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};});
    await page.goto(origin+'/birds/');await page.locator('.birds-start').click();
    await page.waitForFunction(()=>document.querySelector('.birds-message').textContent.includes('denied'));
    assert.equal(await page.locator('.birds-start').isEnabled(),true);
    assert.equal(await page.evaluate(()=>document.body.classList.contains('birds-running')),false);
    assert.equal(await page.locator('.site-header').isVisible(),false);
    assert.equal(await page.locator('.site-footer').isVisible(),false);
    await denied.close();
    // Stopping a pending start must discard and close a late camera stream.
    const cancelled=await browser.newContext();const cancelPage=await cancelled.newPage();
    await cancelPage.addInitScript(()=>{
      navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{
        window.finishCameraRequest=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=64;window.lateCamera=canvas.captureStream();resolve(window.lateCamera);};
      });
    });
    await cancelPage.goto(origin+'/birds/');await cancelPage.locator('.birds-stop').click();
    await cancelPage.waitForFunction(()=>typeof finishCameraRequest==='function');
    assert.equal(await cancelPage.locator('.birds-stop').textContent(),'Stop camera');
    await cancelPage.locator('.birds-stop').click();await cancelPage.evaluate(()=>finishCameraRequest());
    await cancelPage.waitForFunction(()=>lateCamera.getTracks().every(track=>track.readyState==='ended'));
    assert.equal(await cancelPage.evaluate(()=>document.querySelector('video').srcObject),null);
    assert.equal(await cancelPage.locator('.birds-start').isEnabled(),true);
    assert.equal(await cancelPage.locator('.birds-stop').textContent(),'Start camera');
    await cancelled.close();
    assert.deepEqual(errors,[]);
    assert.ok(requests.every(r=>r.url.startsWith(origin+'/') && r.method==='GET' && !r.body));
    const html=fs.readFileSync(path.join(root,'birds/index.html'),'utf8');
    assert.ok(!html.includes('cloudflareinsights') && !html.includes('googletagmanager'));
    assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('analytics-consent.js'));
    assert.ok(!fs.readFileSync(path.join(root,'work/index.html'),'utf8').includes('href="/birds/"'));
    console.log(JSON.stringify({viewports:4, camera:'synthetic Chromium camera', lifecycle:'central start, toolbar start/stop, resume/interruption, permission denial, pending-start cancellation', network:'only same-origin GETs, no uploads', errors},null,2));
  } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
