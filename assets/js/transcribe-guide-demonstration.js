/* Scripted lessons over the inert app layout. No app runtime or real playback. */
import { renderIllustration, createTimelinePainter, createViewportPainter, audioDuration } from './transcribe-guide-illustration.js?v=20261025-full-guide';
import { beforeStep, afterStep } from './transcribe-guide-lessons.js?v=20261025-full-guide';

// Shared with the camera so gestures, waits and progress use the same pace.
export const DEMONSTRATION_PACE = 1.25;
const firstReadingHold = 1800, readingHold = 850, resultHold = 1300;
// Keep the affected surface visible while a control changes it. Cursor targets
// remain separate: speed buttons still supply their real click coordinates.
const contextActions = new Set(['zoom','speed','play','pause','start','selection','repeat','ensure-repeat','panel','measure-menu','measure-go']);
const framingFor = step => contextActions.has(step.action) ? 'context' : step.focus || 'context';

export function createDemonstration(app, camera, reducedMotion, controller) {
  const pointer = document.createElement('div');
  pointer.className = 'guide-demo-pointer'; pointer.hidden = true; pointer.setAttribute('aria-hidden','true');
  pointer.innerHTML = '<svg viewBox="0 0 32 40"><path d="M4 3V27L10 21L15 32L19 30L14 19H24Z" fill="#171717" stroke="#fff" stroke-width="1.25" stroke-linejoin="round"/></svg>';
  camera.append(pointer);
  let revision=0, frame=0, progressFrame=0, pendingResolve, cursorPosition, scene;
  let paused=false, playbackRate=1, clockTime=0, clockStamp=performance.now();
  const now=()=>{const stamp=performance.now();if(!paused)clockTime+=(stamp-clockStamp)*playbackRate;clockStamp=stamp;return clockTime;};
  function setRate(value){now();playbackRate=value;controller.setRate?.(value);pointer.style.setProperty('--guide-cursor-duration',`${140/value}ms`);}
  function setPaused(value) {
    if(paused===value)return;
    now();
    paused=value; camera.dataset.demoPaused=String(paused); controller.setPaused(paused);
    for(const effect of pointer.querySelector('svg').getAnimations()) {
      if(paused){const time=effect.currentTime;effect.pause();effect.currentTime=time;}else effect.play();
    }
  }
  function stop() {
    revision++;controller.cancel();setPaused(false);clockTime=0;clockStamp=performance.now();
    cancelAnimationFrame(frame);cancelAnimationFrame(progressFrame);pendingResolve?.(false);pendingResolve=null;
    pointer.hidden=true;pointer.classList.remove('is-pressed');cursorPosition=null;
    camera.dataset.demoPhase='none';camera.dataset.demoView='';
    delete app.dataset.demoSelectionEnd;
  }
  function zoomValue(duration) {
    const zoom=audioDuration/duration, maximum=Math.max(32,audioDuration/24);
    return zoom<=16?(zoom-1)/15*50:50+(zoom-16)/(maximum-16)*50;
  }
  function render() {
    controller.panel(scene.panel);
    renderIllustration(app,scene.loaded?'loaded':'empty',scene);
    app.querySelector('#transcribe-zoom').value=String(zoomValue(scene.viewDuration));
  }
  function prepare(lesson,index=0) {
    stop();scene=beforeStep(lesson,index);render();controller.step(index);
  }
  function point(selector,fraction=0.5,vertical=0.5) {
    const rect=app.querySelector(selector).getBoundingClientRect(),bounds=camera.getBoundingClientRect();
    return{x:rect.left-bounds.left+rect.width*fraction,y:rect.top-bounds.top+rect.height*vertical};
  }
  function indicate(position,pressed=false) {
    cursorPosition=position;pointer.hidden=false;pointer.classList.toggle('is-pressed',pressed);
    pointer.style.left=`${position.x-3}px`;pointer.style.top=`${position.y-2.25}px`;
  }
  function animate(duration,update,token) {
    duration *= DEMONSTRATION_PACE;
    return new Promise(resolve=>{
      pendingResolve=resolve;const started=now();
      function tick(){
        if(revision!==token){resolve(false);return;}
        if(paused){frame=requestAnimationFrame(tick);return;}
        const progress=Math.min(1,(now()-started)/duration);update(progress);
        if(progress<1)frame=requestAnimationFrame(tick);else{pendingResolve=null;resolve(true);}
      }
      frame=requestAnimationFrame(tick);
    });
  }
  const wait=(duration,token)=>animate(duration,()=>{},token);
  async function approach(position,token) {
    camera.dataset.demoPhase='pointing';
    const start=cursorPosition||{x:Math.max(16,position.x-72),y:Math.min(camera.clientHeight-36,position.y+48)};
    return animate(650,p=>{const t=p*p*(3-2*p);indicate({x:start.x+(position.x-start.x)*t,y:start.y+(position.y-start.y)*t});},token);
  }
  async function click(selector,token,action) {
    const position=typeof selector==='string'?point(selector):selector;
    if(!await approach(position,token)||!await wait(200,token))return false;
    camera.dataset.demoPhase='pressing';indicate(position,true);
    if(!await wait(220,token))return false;
    action();indicate(position);camera.dataset.demoPhase='released';return wait(350,token);
  }
  async function view(framing,lesson,token) {
    pointer.hidden=true;cursorPosition=null;camera.dataset.demoPhase='framing';
    if(!await controller.frame(framing,lesson)||revision!==token)return false;
    camera.dataset.demoView=framing==='context'?'context':'controls';return true;
  }
  async function drag(start,end,token,duration,paint,phase='dragging') {
    if(!await approach(start,token)||!await wait(200,token))return false;
    camera.dataset.demoPhase='pressing';indicate(start,true);
    if(!await wait(300,token))return false;
    camera.dataset.demoPhase=phase;
    if(!await animate(duration,p=>{const t=p*p*(3-2*p);paint(t);indicate({x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t},true);},token))return false;
    indicate(end);camera.dataset.demoPhase='released';return true;
  }
  async function runStep(lesson,step,token) {
    const next=afterStep(scene,step);
    const commit=()=>{scene=next;render();};
    const framing=framingFor(step);
    if(!await view(framing,lesson,token))return false;
    switch(step.action) {
      case 'open':
        if(!await click('#transcribe-file-name',token,()=>{}))return false;
        if(step.loadAfterClick){commit();return view('context',lesson,token);}
        return true;
      case 'load':
        // The chooser is native to Transcribe. Never invent or open an OS dialog here.
        camera.dataset.demoPhase='choosing-file';if(!await wait(1100,token))return false;commit();return wait(600,token);
      case 'inspect': camera.dataset.demoPhase='context';return wait(1500,token);
      case 'pan': {
        const from=scene.viewStart,paint=createViewportPainter(app,scene);
        const start=point('#transcribe-overview',(from+scene.viewDuration/2)/audioDuration,0.65);
        const end=point('#transcribe-overview',(next.viewStart+scene.viewDuration/2)/audioDuration,0.65);
        if(!await drag(start,end,token,2200,t=>paint(from+(next.viewStart-from)*t),'panning-timeline'))return false;
        commit();return wait(600,token);
      }
      case 'seek': {
        const position=point('#transcribe-waveform',(step.position-scene.viewStart)/scene.viewDuration);
        return click(position,token,commit);
      }
      case 'zoom': {
        const slider=app.querySelector('#transcribe-zoom');
        const from=scene.viewDuration,paint=createViewportPainter(app,scene);
        const start=point('#transcribe-zoom',Math.max(0,Math.min(1,zoomValue(from)/100)));
        const end=point('#transcribe-zoom',Math.max(0,Math.min(1,zoomValue(step.viewDuration)/100)));
        if(!await drag(start,end,token,1500,t=>{const duration=from+(step.viewDuration-from)*t;paint({viewDuration:duration});slider.value=String(zoomValue(duration));}))return false;
        commit();return view('context',lesson,token);
      }
      case 'highlight': {
        const paint=createTimelinePainter(app,'loaded',{...scene,selection:null,selectionOnly:false,repeat:false,position:scene.position});
        const start=point('#transcribe-waveform',(step.range[0]-scene.viewStart)/scene.viewDuration);
        const end=point('#transcribe-waveform',(step.range[1]-scene.viewStart)/scene.viewDuration);
        if(!await drag(start,end,token,1500,t=>paint({selection:[step.range[0],step.range[0]+(step.range[1]-step.range[0])*t],position:step.range[0]})))return false;
        commit();return wait(800,token);
      }
      case 'ensure-repeat':
        // Drawing a selection already enables these in the real app. Do not toggle them off.
        for(const selector of ['#transcribe-selection-only','#transcribe-loop-bottom']) {
          if(!await approach(point(selector),token)||!await wait(600,token))return false;
        }
        if(!scene.repeat)return click('#transcribe-loop-bottom',token,commit);
        return true;
      case 'play': {
        const initial=scene.position;
        if(!scene.playing&&!await click('#transcribe-play',token,()=>{scene={...scene,playing:true};render();}))return false;
        if(!await view('context',lesson,token))return false;
        const paint=createTimelinePainter(app,'loaded',scene);camera.dataset.demoPhase='playing';
        if(!await animate((step.loop?3200:2300)/scene.speed,p=>{
          const position=step.loop&&scene.selection?scene.selection[0]+((p*1.75)%1)*(scene.selection[1]-scene.selection[0]):initial+p*3;
          paint({position});
        },token))return false;
        scene=next;return true;
      }
      case 'pause':
        if(!await click('#transcribe-play',token,commit))return false;
        return view('context',lesson,token);
      case 'start':
        if(!await click('#transcribe-start',token,commit))return false;
        return view('context',lesson,token);
      case 'repeat': return click('#transcribe-loop-bottom',token,commit);
      case 'selection': return click('#transcribe-selection-only',token,commit);
      case 'speed': {
        if(!await click(step.focus.target,token,commit))return false;
        if(!scene.playing)return true;
        if(!await view('context',lesson,token))return false;
        const paint=createTimelinePainter(app,'loaded',scene),initial=scene.position;
        camera.dataset.demoPhase='playing';
        if(!await animate(2600/scene.speed,p=>{
          const position=scene.selectionOnly&&scene.selection?scene.selection[0]+((initial-scene.selection[0]+p*(scene.selection[1]-scene.selection[0]))%(scene.selection[1]-scene.selection[0])):initial+p*2.6;
          paint({position});
        },token))return false;
        return true;
      }
      case 'field-drag': {
        const start=point(step.target,step.from),end=point(step.target,step.to),from=scene[step.key]||0;
        if(!await drag(start,end,token,1500,t=>{scene={...scene,[step.key]:Math.round(from+(step.value-from)*t)};render();}))return false;
        commit();return true;
      }
      case 'toggle-setting': return click(step.target,token,commit);
      case 'sound-reset': case 'eq-reset': case 'stems-reset': return click(step.focus.target,token,commit);
      case 'eq-drag': {
        const start=point('#transcribe-eq-graph',595.5143714486105/1344,438/882),end=point('#transcribe-eq-graph',595.5143714486105/1344,326/882);
        if(!await drag(start,end,token,1500,t=>{scene={...scene,eqGain:t*8};render();}))return false;
        commit();return true;
      }
      case 'piano': {
        const canvas=app.querySelector('#transcribe-keyboard'),rect=canvas.getBoundingClientRect(),bounds=camera.getBoundingClientRect();
        const location={x:rect.left-bounds.left+rect.width*21.5/42,y:rect.top-bounds.top+rect.height*.85};
        if(!await approach(location,token)||!await wait(200,token))return false;
        indicate(location,true);scene={...scene,piano:true};render();camera.dataset.demoPhase='auditioning';
        if(!await wait(1200,token))return false;
        indicate(location);scene={...scene,piano:false};render();return true;
      }
      case 'marker-drag': {
        const start=point('#transcribe-mark-ruler',4/scene.viewDuration,.5),end=point('#transcribe-mark-ruler',5/scene.viewDuration,.5);
        if(!await drag(start,end,token,1500,t=>{scene={...scene,markers:scene.markers.map((m,i)=>i===2?{...m,time:4+t}:m)};render();}))return false;
        commit();return true;
      }
      case 'measure-menu': return click('#transcribe-measures',token,commit);
      case 'measure-go': {
        if(!await click('#transcribe-go-measure',token,()=>{}))return false;
        camera.dataset.demoPhase='typing';
        for(const value of ['B','B3']){app.querySelector('#transcribe-go-measure').value=value;if(!await wait(350,token))return false;}
        if(!await wait(450,token))return false;commit();return view('context',lesson,token);
      }
      case 'lock': return click('#transcribe-pitch-lock',token,commit);
      case 'panel': return click('#transcribe-controls-toggle',token,commit);
      default:return true;
    }
  }
  function stepDuration(step,first){
    const framing=framingFor(step);
    const effect=controller.contextDuration(framing),clickTime=1420;
    let action=clickTime;
    switch(step.action){
      case 'open': action=clickTime+(step.loadAfterClick?effect:0);break;
      case 'load': action=1700;break;
      case 'inspect': action=1500;break;
      case 'pan': action=3950;break;
      case 'field-drag': case 'eq-drag': case 'marker-drag': action=2650;break;
      case 'piano': action=2050;break;
      case 'measure-go': action=2570+effect;break;
      case 'zoom': action=2650+effect;break;
      case 'highlight': action=3450;break;
      case 'ensure-repeat': action=2500+(scene.repeat?0:clickTime);break;
      case 'play': action=(scene.playing?0:clickTime)+effect+(step.loop?3200:2300)/scene.speed;break;
      case 'pause': case 'start': action=clickTime+effect;break;
      case 'speed': action=clickTime+(scene.playing?effect+2600/step.speed:0);break;
    }
    return (controller.frameDuration(framing)+action+(first?firstReadingHold:readingHold)+resultHold)*DEMONSTRATION_PACE;
  }
  function trackProgress(index,duration,token){
    const started=now();
    function tick(){
      if(revision!==token)return;
      if(!paused)controller.progress(index,Math.min(.995,(now()-started)/duration));
      progressFrame=requestAnimationFrame(tick);
    }
    progressFrame=requestAnimationFrame(tick);
  }
  async function run(lesson,index,token) {
    for(let i=index;i<lesson.steps.length;i++){
      if(revision!==token)return;
      controller.step(i,{follow:i>index});
      trackProgress(i,stepDuration(lesson.steps[i],i===index),token);
      camera.dataset.demoPhase='reading';
      if(!await wait(i===index?firstReadingHold:readingHold,token)||revision!==token)return;
      if(!await runStep(lesson,lesson.steps[i],token)||revision!==token)return;
      camera.dataset.demoPhase='reviewing';
      if(!await wait(resultHold,token))return;
      cancelAnimationFrame(progressFrame);controller.progress(i,1);
    }
    pointer.hidden=true;camera.dataset.demoPhase='complete';controller.complete();
  }
  function start(lesson,explicitPlay=false,index=0,autoplay=true) {
    prepare(lesson,index);
    if(!autoplay&&!explicitPlay){controller.frame('context',lesson);camera.dataset.demoPhase='idle';controller.progress(index,0);return true;}
    if(reducedMotion.matches&&!explicitPlay){scene=afterStep(scene,lesson.steps[index]);render();controller.frame(framingFor(lesson.steps[index]),lesson);camera.dataset.demoPhase='static';controller.progress(index,1);return true;}
    void run(lesson,index,revision);return true;
  }
  return{prepare,start,stop,setPaused,setRate,getRate:()=>playbackRate,getTime:now,isPaused:()=>paused};
}
