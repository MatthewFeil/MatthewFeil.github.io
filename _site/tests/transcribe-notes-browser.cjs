// Run against the active preview; accepts the same Playwright environment options as other browser checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const url = process.env.TRANSCRIBE_BROWSER_URL || 'http://127.0.0.1:4001/transcribe/';
function recording() {
  const rate=44100, length=rate*6, wav=Buffer.alloc(44+length*2);
  wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);
  wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);
  wav.write('data',36);wav.writeUInt32LE(length*2,40);
  for(let i=0;i<length;i++) {
    const t=i/rate; let v=0;
    for(const [midi, amplitude] of [[48,.025],[52,.022],[55,.023]])for(const [h,a] of [[1,1],[2,.3],[3,.15]])v+=amplitude*a*Math.sin(2*Math.PI*440*2**((midi-69)/12)*h*t);
    if(t>.2&&t<2 || t>3&&t<5) {
      for(const [h,a] of [[1,1],[2,.3],[3,.15]])v+=.14*a*Math.sin(2*Math.PI*(t<2?659.255:698.456)*h*t);
      for(const [h,a] of [[1,1],[2,.3],[3,.15]])v+=.11*a*Math.sin(2*Math.PI*(t<2?493.883:523.251)*h*t);
    }
    wav.writeInt16LE(Math.round(v*30000),44+i*2);
  }
  return wav;
}
async function config(page) {
  await page.locator('#transcribe-config-export').click();
  const value=await page.evaluate(async()=>JSON.parse(await window.configBlob.text()));
  await page.locator('#transcribe-config-dismiss').click();
  return value;
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const results=[];
  try {
    for(const [width,height] of [[1440,900],[390,844],[320,568]]) {
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,isMobile:width<500});
      await context.addInitScript(()=>{
        const create=URL.createObjectURL.bind(URL);
        URL.createObjectURL=blob=>{if(blob.type==='application/json')window.configBlob=blob;return create(blob)};
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url);
      assert.equal(await page.locator('#transcribe-spectrum-scale, #transcribe-note-tolerance, #transcribe-detection-reset').count(),0);
      await page.locator('#transcribe-file').setInputFiles({name:'melody-rest.wav',mimeType:'audio/wav',buffer:recording()});
      await page.waitForFunction(()=>!document.getElementById('transcribe-config-export').disabled);
      await page.locator('#transcribe-controls-toggle').click();
      await page.locator('#transcribe-detection-mode').selectOption('balanced');
      await page.locator('#transcribe-detection-low').fill('f sharp 1');
      await page.locator('#transcribe-detection-low').press('Enter');
      await page.locator('#transcribe-detection-mode').selectOption('melody');
      await page.locator('#transcribe-detection-low').fill('c4');
      await page.locator('#transcribe-detection-low').press('Enter');
      await page.locator('#transcribe-detection-mode').selectOption('balanced');
      assert.equal(await page.locator('#transcribe-detection-low').inputValue(),'C1');
      assert.equal(await page.locator('#transcribe-detection-high').inputValue(),'B6');
      await page.locator('#transcribe-detection-mode').selectOption('melody');
      assert.equal(await page.locator('#transcribe-detection-low').inputValue(),'C3');
      assert.equal(await page.locator('#transcribe-detection-high').inputValue(),'C6');
      for(const [mode,low,high] of [['bass','C1','C3'],['chordal','C2','C6'],['melody','C3','C6']]) {
        await page.locator('#transcribe-detection-mode').selectOption(mode);
        assert.equal(await page.locator('#transcribe-detection-low').inputValue(),low);
        assert.equal(await page.locator('#transcribe-detection-high').inputValue(),high);
      }
      const lowField=page.locator('#transcribe-detection-low'), highField=page.locator('#transcribe-detection-high');
      for(const spelling of ['c#6','C#6','C sharp 6','D flat 6']) {
        await highField.fill(spelling);await highField.press('Enter');
        assert.equal(await highField.inputValue(),'C#6');
      }
      for(const invalid of ['H4','C7']) {
        await highField.fill(invalid);await highField.press('Enter');
        assert.equal(await highField.getAttribute('aria-invalid'),'true');
        await highField.press('Escape');assert.equal(await highField.inputValue(),'C#6');
      }
      await highField.fill('C6');await highField.press('Enter');
      await lowField.fill('c4');await lowField.press('Enter');
      const measured=await page.evaluate(()=>{
        const parent=document.getElementById('transcribe-detection-controls'),r=parent.getBoundingClientRect();
        return {viewportOverflow:document.documentElement.scrollWidth-innerWidth,
          overflow:parent.scrollWidth-parent.clientWidth,
          fields:[...parent.querySelectorAll('select,input,button')].map(e=>{const q=e.getBoundingClientRect();return {id:e.id,width:q.width,left:q.left-r.left,right:q.right-r.right}})};
      });
      assert(measured.overflow<=1,JSON.stringify(measured));
      for(const field of measured.fields)assert(field.width>0&&field.left>=-1&&field.right<=1,JSON.stringify(field));
      assert(measured.viewportOverflow<=1,`Viewport overflow at ${width}: ${measured.viewportOverflow}`);
      if(process.env.TRANSCRIBE_NOTES_BROWSER_OUTPUT) {
        fs.mkdirSync(process.env.TRANSCRIBE_NOTES_BROWSER_OUTPUT,{recursive:true});
        await page.screenshot({path:`${process.env.TRANSCRIBE_NOTES_BROWSER_OUTPUT}/${width}.png`});
      }
      if(width===1440) {
        const saved=await config(page);assert.equal(saved.settings.detection.mode,'melody');assert.equal(saved.settings.detection.ranges.melody.low,60);
        // Continuous melody rests must clear the automatic highlight while the chord continues.
        await page.locator('#transcribe-play').click();
        await page.waitForFunction(()=>document.getElementById('transcribe-audio').currentTime>1);
        assert.match(await page.locator('#transcribe-keyboard').getAttribute('aria-label'),/Relative note strengths: E5 /);
        assert.match(await page.locator('#transcribe-keyboard').getAttribute('aria-label'),/B4 /);
        await page.waitForFunction(()=>document.getElementById('transcribe-audio').currentTime>2.35);
        assert.doesNotMatch(await page.locator('#transcribe-keyboard').getAttribute('aria-label'),/Relative note strengths:/);
        await page.waitForFunction(()=>document.getElementById('transcribe-audio').currentTime>3.4);
        assert.match(await page.locator('#transcribe-keyboard').getAttribute('aria-label'),/Relative note strengths: F5 /);
        assert.match(await page.locator('#transcribe-keyboard').getAttribute('aria-label'),/C5 /);
        await page.locator('#transcribe-play').click();
        await page.waitForFunction(()=>new Promise(resolve=>{
          const r=indexedDB.open('transcribe-session',1);r.onsuccess=()=>{const db=r.result,g=db.transaction('session').objectStore('session').get('config');g.onsuccess=()=>{resolve(g.result?.settings?.detection?.mode==='melody');db.close()}};
        }));
        await page.reload();await page.waitForFunction(()=>!document.getElementById('transcribe-play').disabled);
        assert.equal(await page.locator('#transcribe-detection-mode').inputValue(),'melody');assert.equal(await page.locator('#transcribe-detection-low').inputValue(),'C4');
        const legacy=structuredClone(saved);delete legacy.settings.detection;
        legacy.settings.spectrumScale='db';legacy.settings.noteTolerance='0.22';
        await page.locator('#transcribe-config-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
        await page.waitForFunction(()=>document.getElementById('transcribe-detection-mode').value==='balanced');
        const bad=structuredClone(saved);bad.settings.detection.ranges.melody={low:85,high:60};
        await page.locator('#transcribe-config-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
        await page.waitForFunction(()=>document.getElementById('transcribe-config-message').textContent.includes('Invalid preferred'));
        assert.equal(await page.locator('#transcribe-detection-mode').inputValue(),'balanced');
      }
      assert.deepEqual(errors,[]);results.push({width,height,pass:true});await context.close();
    }
    console.log(JSON.stringify(results,null,2));
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
