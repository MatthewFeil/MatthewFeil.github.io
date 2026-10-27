const{assert,base,launch,ready,lesson,step}=require('./transcribe-guide-test-helpers.cjs');
(async()=>{const browser=await launch();try{
for(const[width,height]of [[1440,900],[390,844],[320,568],[844,390],[568,320]])for(const quick of [true]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,reducedMotion:'reduce'}),errors=[],failed=[];
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText}));
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.runtimeCalls=[];for(const name of ['AudioContext','webkitAudioContext','Worker'])window[name]=class{constructor(){window.runtimeCalls.push(name);throw Error(name);}};const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.runtimeCalls.push('IndexedDB');return open(...args);};});
 await page.goto(base+(quick?'quick-start/':''));await ready(page).catch(async error=>{console.error({url:page.url(),errors,failed,state:await page.locator('#guide-camera').evaluate(el=>({...el.dataset}))});throw error;});
 assert.match(await page.title(),quick?/Transcribe quick start/:/Transcribe app guide/);
 assert.equal(await page.locator('[data-guide-mockup]').count(),1);assert(await page.locator('[data-guide-mockup]').evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'));
 assert.equal(await page.locator('[data-transcribe-app],iframe,audio,input[type="file"],.guide-demo-caption,.guide-demo-replay,#guide-target').count(),0);
 const ids=await page.locator('.guide-topics [data-guide-lesson]').evaluateAll(links=>links.map(a=>a.dataset.guideLesson));
 assert.deepEqual(ids,quick?['open','playback','find','loop','speed']:['recording','timeline','transport','sound']);
 for(const id of ids){await lesson(page,id);const steps=await page.locator('[data-guide-section]:visible [data-guide-jump]').evaluateAll(buttons=>buttons.map(b=>b.dataset.guideJump));for(const key of steps){await step(page,key);assert.equal(await page.locator('[data-guide-section]:visible').count(),1);assert.equal(await page.locator('[aria-current="step"]').count(),1);assert.equal(await page.locator('[data-step-status],[data-guide-step-label],[data-guide-rail]').count(),0);assert.equal(await page.locator('[aria-current="step"]').evaluate(el=>el.closest('[data-guide-step]').style.getPropertyValue('--step-progress')),'1');assert.equal(await page.locator('#transcribe-measure-panel').isVisible(),false);assert.equal(await page.locator('#guide-stage').evaluate(el=>el.getAnimations().length),0);}}
 await lesson(page,quick?'loop':'timeline');await step(page,quick?'play':'highlight');
 for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.waitForFunction(()=>document.getElementById('guide-camera').dataset.demoPhase==='static');if(process.env.TRANSCRIBE_BROWSER_OUTPUT)await page.screenshot({path:`${process.env.TRANSCRIBE_BROWSER_OUTPUT}/walkthrough-${quick?'quick':'reference'}-${width}-${theme}.png`});}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(width<=1100)assert(await page.locator('.guide-viewer').evaluate(el=>el.offsetHeight<=innerHeight/3+3),'Mobile viewer stays under one-third viewport height');
 if(width===1440){const xs=await page.evaluate(()=>['.guide-topics','.guide-article','.guide-viewer'].map(s=>document.querySelector(s).getBoundingClientRect().x));assert(xs[0]<xs[1]&&xs[1]<xs[2]);}
 await page.keyboard.press('Alt+Shift+KeyK');assert.equal(await page.locator('html').getAttribute('data-keyboard-navigation'),'on');assert.equal(await page.locator('.keyboard-navigation-toggle').isVisible(),false);await page.keyboard.press('Alt+Shift+KeyK');assert.equal(await page.locator('html').getAttribute('data-keyboard-navigation'),'off');
 assert.deepEqual(await page.evaluate(()=>window.runtimeCalls),[]);assert.deepEqual(errors,[]);
 console.log(`${width}x${height} ${quick?'Quick start':'App guide'}: ordered steps, themes, responsive layout, inertness and keyboard checks passed`);await page.close();
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
