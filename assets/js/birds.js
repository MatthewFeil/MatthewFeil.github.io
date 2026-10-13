import { BirdTracker, projectBox, iou as overlap, trackSupported, MOTION_BRIDGE_MS, speciesConfidenceRating } from './birds-core.mjs?v=20261013-scopes1';
import {advanceByMotion,smoothTrackingBox,motionFraction} from './birds-motion.mjs?v=20261013-responsive1';
import {BirdScheduler} from './birds-scheduler.mjs?v=20261013-scheduling1';
const scheduler=new BirdScheduler();
const app=document.querySelector('[data-birds-app]');
const video=app.querySelector('video'),stage=app.querySelector('.birds-stage'),overlays=app.querySelector('.birds-overlays');
const welcome=app.querySelector('.birds-welcome'),message=app.querySelector('.birds-message'),toolbar=app.querySelector('.birds-toolbar');
const start=app.querySelector('.birds-start'),stop=app.querySelector('.birds-stop'),status=app.querySelector('.birds-status');
const timing=app.querySelector('.birds-timing'),rates=app.querySelector('.birds-rates'),device=app.querySelector('.birds-device');
let analysisTimes=[],motionTimes=[],metricsStarted=0,lastMetrics=0,modelProvider='';
const warning=app.querySelector('.birds-warning'),warningText=app.querySelector('.birds-warning-text'),retry=app.querySelector('.birds-retry');
const loading=app.querySelector('.birds-loading'),loadingMessage=app.querySelector('.birds-loading-message');
const scopeControl=app.querySelector('.birds-scope'),availability=app.querySelector('.birds-availability');
const scopeNotes={
  'common-north-america':'Experimental identification of 52 common North American species.',
  'north-america':'Experimental identification of 181 North American species, including regional and migratory birds.',
  worldwide:'Experimental identification of all 525 worldwide model classes.'
};
let scopeRevision=0;
try {const saved=localStorage.getItem('birds-species-scope');if(Object.hasOwn(scopeNotes,saved))scopeControl.value=saved;} catch { /* Storage is optional. */ }
function updateScopeNote() {availability.textContent=scopeNotes[scopeControl.value];}
updateScopeNote();
const tracker=new BirdTracker(10000),overlayNodes=new Map();
// Text can reflow after a font, orientation, or viewport change. Keep cached bounds current.
const labelObserver=new ResizeObserver(entries=>{
  let changed=false;
  for(const {target} of entries){const nodes=overlayNodes.get(Number(target.dataset.trackId));if(!nodes || nodes.label!==target)continue;
    const width=target.offsetWidth,height=target.offsetHeight;
    if(width!==nodes.width || height!==nodes.height){nodes.width=width;nodes.height=height;changed=true;}
  }
  if(changed)render();
});
const motionCanvas=document.createElement('canvas'),motionCtx=motionCanvas.getContext('2d',{willReadFrequently:true});
let motionWorker,motionPending=false,motionTimer,motionSnapshot=[],motionVideoFrame=null,nextMotionCapture=-Infinity,lastMotionMediaTime=-1,renderFrame,motionWatchdog,motionFailures=0;
let stream,worker,generation=0,ready=false,pending=false,timer,watchdog,overlayExpiry,lastResult=0,lastLatency=500,species=new Map(),tracks=[],captureFailures=0,frameUnavailableSince=0;
const expiry=()=>Math.min(10000,Math.max(3000,lastLatency*2+500));
function setStatus(text) {if(status.textContent!==text) status.textContent=text;if(!loading.hidden) loadingMessage.textContent=text;}
function showWarning(text,kind='analysis') {warningText.textContent=text;warning.dataset.kind=kind;warning.hidden=false;}
function clearWarning(kind) {if(!kind || warning.dataset.kind===kind){warning.hidden=true;warningText.textContent='';}}
function updateDiagnostics(now=performance.now()) {
  if(!ready || now-lastMetrics<1000)return;
  lastMetrics=now;
  const windowMs=Math.min(2000,now-metricsStarted);
  analysisTimes=analysisTimes.filter(t=>now-t<2000);motionTimes=motionTimes.filter(t=>now-t<2000);
  const rate=times=>windowMs>=250?(times.length*1000/windowMs).toFixed(1):'—';
  timing.textContent=analysisTimes.length?`analysis: ${Math.round(lastLatency)} ms`:'Waiting for results…';
  rates.textContent=`AI: ${rate(analysisTimes)}/s · Motion: ${rate(motionTimes)}/s`;
  device.textContent=`${modelProvider} · ${video.videoWidth} × ${video.videoHeight}`;
}
function setLoading(active) {
  loading.hidden=!active;stage.classList.toggle('birds-model-loading',active);stage.setAttribute('aria-busy',String(active));
}
function clearAnalysis() {
  generation++;scheduler.reset();if(motionVideoFrame!==null)video.cancelVideoFrameCallback?.(motionVideoFrame);motionVideoFrame=null;nextMotionCapture=-Infinity;lastMotionMediaTime=-1;clearTimeout(motionWatchdog);motionFailures=0;captureFailures=0;frameUnavailableSince=0;clearWarning();cancelAnimationFrame(renderFrame);renderFrame=null;clearTimeout(motionTimer);motionWorker?.terminate();motionWorker=null;motionPending=false;motionSnapshot=[];clearTimeout(timer);clearTimeout(watchdog);clearTimeout(overlayExpiry);worker?.terminate();worker=null;
  labelObserver.disconnect();ready=false;pending=false;tracker.clear();tracks=[];overlays.replaceChildren();overlayNodes.clear();timing.textContent='';rates.textContent='';device.textContent='';analysisTimes=[];motionTimes=[];metricsStarted=0;lastMetrics=0;modelProvider='';
  setLoading(false);
}
function render() {
  if(renderFrame==null)renderFrame=requestAnimationFrame(drawOverlays);
}
function drawOverlays() {
  renderFrame=null;
  const now=performance.now();let moving=false;
  if(!video.videoWidth || performance.now()-lastResult>expiry()) {labelObserver.disconnect();overlays.replaceChildren();overlayNodes.clear();return;}
  clearTimeout(overlayExpiry);overlayExpiry=setTimeout(render,Math.max(16,expiry()-(performance.now()-lastResult)+20));
  const active=new Set();
  const width=stage.clientWidth,height=stage.clientHeight,bottom=height-toolbar.offsetHeight;
  const insets=getComputedStyle(overlays),left=parseFloat(insets.paddingLeft),right=parseFloat(insets.paddingRight),top=parseFloat(insets.paddingTop);
  const labelBottom=bottom-parseFloat(insets.paddingBottom),availableWidth=Math.max(1,width-left-right);
  for(const track of tracks) {
    const targetRect=projectBox(track.box,video.videoWidth,video.videoHeight,width,height);
    if(!targetRect || targetRect.y>=bottom) continue;
    active.add(track.id);
    let nodes=overlayNodes.get(track.id);
    if(!nodes || !nodes.box.isConnected) {
      const box=document.createElement('div'),label=document.createElement('span');
      const labelName=document.createElement('span'),confidence=document.createElement('span');
      confidence.className='birds-confidence';label.append(labelName,confidence);
      box.className='birds-box';label.className='birds-label';overlays.append(box,label);
      nodes={box,label,labelName,confidence,text:null,width:0,height:0,viewport:0};overlayNodes.set(track.id,nodes);
      label.dataset.trackId=String(track.id);labelObserver.observe(label);
    }
    nodes.drawBox=smoothTrackingBox(nodes.drawBox,track.box,now-(nodes.drawTime ?? now));nodes.drawTime=now;
    moving ||= nodes.drawBox.some((v,i)=>v!==track.box[i]);
    const rect=projectBox(nodes.drawBox,video.videoWidth,video.videoHeight,width,height);
    if(!rect)continue;
    const {box,label,labelName,confidence}=nodes;
    Object.assign(box.style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${Math.min(rect.height,bottom-rect.y)}px`});
    const name=species.get(track.speciesId)?.commonName;
    // Geometry-only updates retain history: a missing result is still identifying,
    // while an explicit null classification means the last attempt was inconclusive.
    const state=name?'identified':track.history.length && track.history.at(-1)===null?'uncertain':'identifying';
    if(box.dataset.state!==state) {box.dataset.state=state;label.dataset.state=state;}
    const rating=state==='identified'?speciesConfidenceRating(track.confidence):null;
    const score=rating===null?'':` · ${rating}/5`;
    const text=state==='identified'?name+score:'';
    label.hidden=!text;
    if(nodes.text!==text || nodes.viewport!==availableWidth) {
      labelName.textContent=name || '';confidence.textContent=score;label.style.maxWidth=`min(16rem, ${availableWidth}px)`;
      nodes.text=text;nodes.viewport=availableWidth;nodes.width=label.offsetWidth;nodes.height=label.offsetHeight;
    }
    if(text) {
      label.style.left=`${Math.max(left,Math.min(rect.x,width-right-nodes.width))}px`;
      label.style.top=`${Math.max(top,Math.min(rect.y-nodes.height-2,labelBottom-nodes.height))}px`;
    }
  }
  for(const [id,nodes] of overlayNodes)if(!active.has(id)){labelObserver.unobserve(nodes.label);nodes.box.remove();nodes.label.remove();overlayNodes.delete(id);}
  if(moving)render();
}
function halt(text='Camera images stay on your device.',resume=false) {
  clearAnalysis();
  stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;
  document.body.classList.remove('birds-running');welcome.hidden=false;
  stop.textContent='Start camera';stop.setAttribute('aria-pressed','false');setStatus(resume?'Camera paused':'Camera off');
  start.disabled=false;start.querySelector('.birds-start-label').textContent=resume?'Resume camera':'Start camera';message.textContent=text;
}
function fail(text) {clearAnalysis();setStatus('Identification paused');showWarning(`${text} The camera is still on. Retry identification or stop the camera.`);}
function startMotion(token) {
  try {motionWorker=new Worker(new URL('./birds-motion-worker.mjs?v=20261013-responsive1',import.meta.url),{type:'module'});} catch {recoverMotion(token);return;}
  const activeWorker=motionWorker;
  motionWorker.onmessage=({data})=>{
    if(token!==generation || motionWorker!==activeWorker)return;
    clearTimeout(motionWatchdog);motionPending=false;motionFailures=0;clearWarning('motion');
    const now=performance.now();
    motionTimes.push(now);scheduler.observeMotion(now-data.timestamp,now,tracks);updateDiagnostics();
    if(performance.now()-data.timestamp<200) {
      for(const update of data.updates) {
        const track=tracks.find(t=>t.id===update.id);
        const fraction=track?motionFraction(track,data.fromTimestamp,data.timestamp):0;
        if(!fraction)continue;
        if(track && !update.lost && performance.now()-track.seen<MOTION_BRIDGE_MS) {
          track.box=track.box.map((v,i)=>Math.max(0,Math.min(1,v+(i%2?update.dy:update.dx)*fraction)));
          track.flowDx=(track.flowDx||0)+update.dx*fraction;track.flowDy=(track.flowDy||0)+update.dy*fraction;
          track.motionSeen=data.timestamp;track.motionQuality=update.quality;
        }
        if(track && update.lost){if(!track.motionLost)track.motionLostAt=data.timestamp;track.motionLost=true;}
        else if(track){track.motionLost=false;track.motionLostAt=undefined;}
      }
      tracks=tracks.filter(t=>trackSupported(t,performance.now(),1200));tracker.tracks=tracks;render();
    }
    // A lost motion track gets detector attention as soon as the current job ends.
    if(data.updates.some(t=>t.lost || t.quality<.4) && !pending)scheduleAnalysis(token);
    scheduleMotion(token);
  };
  motionWorker.onerror=event=>{event.preventDefault();if(token===generation && motionWorker===activeWorker)recoverMotion(token);};
  motionFrame(token);
}
function scheduleMotion(token) {
  if(token!==generation || !motionWorker || !stream)return;
  if(video.requestVideoFrameCallback) {
    motionVideoFrame=video.requestVideoFrameCallback(()=>{motionVideoFrame=null;motionFrame(token);});
  } else motionTimer=setTimeout(()=>motionFrame(token),tracks.length?Math.max(4,nextMotionCapture-performance.now()):120);
}
function scheduleAnalysis(token) {
  clearTimeout(timer);
  timer=setTimeout(()=>frame(token),scheduler.analysisDelay(tracks,performance.now()));
}
function recoverMotion(token) {
  if(token!==generation)return;
  if(motionVideoFrame!==null)video.cancelVideoFrameCallback?.(motionVideoFrame);motionVideoFrame=null;
  clearTimeout(motionTimer);clearTimeout(motionWatchdog);motionWorker?.terminate();motionWorker=null;motionPending=false;
  for(const track of tracks){track.motionSeen=undefined;track.motionQuality=0;track.motionLost=true;track.motionLostAt=performance.now();}
  motionFailures++;
  if(motionFailures<=3) {
    showWarning('Smooth tracking interrupted. Retrying…','motion');
    motionTimer=setTimeout(()=>startMotion(token),250*motionFailures);
  } else showWarning('Smooth tracking is unavailable. Identification continues, but outlines may move less smoothly. Retry identification to restart tracking.','motion');
}
function motionFrame(token) {
  if(token!==generation || !motionWorker || !stream)return;
  if(motionPending)return;
  const now=performance.now();
  // No full-frame motion processing while searching, and no duplicate frames.
  if(!tracks.length || now<nextMotionCapture-2 || video.currentTime===lastMotionMediaTime) {scheduleMotion(token);return;}
  if(video.readyState>=2 && video.videoWidth && video.videoHeight) {
    try {
      const ratio=480/Math.max(video.videoWidth,video.videoHeight),width=Math.round(video.videoWidth*ratio),height=Math.round(video.videoHeight*ratio);
      if(motionCanvas.width!==width)motionCanvas.width=width;if(motionCanvas.height!==height)motionCanvas.height=height;
      motionCtx.drawImage(video,0,0,width,height);
      const rgba=motionCtx.getImageData(0,0,width,height).data;
      const period=1000/scheduler.motionFps;
      nextMotionCapture=Number.isFinite(nextMotionCapture)?Math.max(nextMotionCapture+period,now):now+period;
      lastMotionMediaTime=video.currentTime;
      motionPending=true;motionWorker.postMessage({type:'frame',rgba,width,height,timestamp:now,tracks:tracks.map(t=>({id:t.id,box:t.box}))},[rgba.buffer]);
      motionWatchdog=setTimeout(()=>recoverMotion(token),2000);
    } catch {recoverMotion(token);}
  } else motionTimer=setTimeout(()=>motionFrame(token),40);
}
function reconcile(detections,timestamp,geometryOnly=false) {
  const adjusted=detections.map(d=>{
    const anchor=motionSnapshot.filter(t=>!t.used).map(t=>({t,score:overlap(t.box,d.box)})).sort((a,b)=>b.score-a.score)[0];
    const current=anchor && tracks.find(t=>t.id===anchor.t.id);
    if(current && !current.motionLost && anchor.score>.2) {
      anchor.t.used=true;return {...d,trackId:current.id,box:advanceByMotion(d.box,anchor.t,current)};
    }
    return d;
  });
  motionSnapshot.forEach(t=>t.used=false);
  tracks=tracker.update(adjusted,timestamp,geometryOnly,650);render();
}
async function frame(token) {
  if(token!==generation || !ready || !stream) return;
  if(video.readyState<2 || !video.videoWidth || !video.videoHeight) {
    frameUnavailableSince ||= performance.now();
    if(performance.now()-frameUnavailableSince>5000){fail('Camera frames stopped arriving.');return;}
  } else frameUnavailableSince=0;
  if(!pending && video.readyState>=2 && video.videoWidth && video.videoHeight) {
    pending=true;
    let bitmap;
    try {
      const capturedAt=performance.now();scheduler.lastAnalysis=capturedAt;motionSnapshot=tracks.map(t=>({id:t.id,cacheId:t.cacheId,box:[...t.box],flowDx:t.flowDx||0,flowDy:t.flowDy||0}));
      watchdog=setTimeout(()=>{if(token===generation)fail('Analysis took too long.');},45000);
      bitmap=await createImageBitmap(video);
      if(token!==generation || !worker) {bitmap.close();return;}
      worker.postMessage({type:'frame',bitmap,timestamp:capturedAt,tracks:motionSnapshot.map(t=>{const live=tracks.find(v=>v.id===t.id);return {cacheId:t.cacheId,box:t.box,motionReliable:!!live&&!live.motionLost&&capturedAt-(live.motionSeen ?? -Infinity)<200&&live.motionQuality>=.4};})},[bitmap]);
      captureFailures=0;clearWarning('capture');
    } catch {
      bitmap?.close();if(token!==generation)return;clearTimeout(watchdog);pending=false;captureFailures++;
      if(captureFailures>=3){fail('Camera frames could not be read.');return;}
      showWarning('Could not read a camera frame. Retrying…','capture');
    }
  }
  if(performance.now()-lastResult>expiry()) {tracks=[];overlays.replaceChildren();}
  if(!pending) timer=setTimeout(()=>frame(token),120);
}
function loadModel() {
  clearAnalysis();const token=generation;
  setLoading(true);
  setStatus('Loading full precision model…');
  try {worker=new Worker(new URL('./birds-worker.mjs?v=20261013-scopes1',import.meta.url),{type:'module'});} catch {fail('Local analysis could not start.');return;}
  worker.onmessage=({data})=>{
    if(token!==generation) return;
    if(data.type==='progress') setStatus(data.message);
    else if(data.type==='ready') {
      clearTimeout(watchdog);species=new Map(data.species.map(s=>[s.id,s]));ready=true;lastResult=performance.now();lastLatency=500;
      metricsStarted=performance.now();modelProvider=data.provider==='webgpu'?'GPU':data.provider==='wasm'?'CPU':'Local';updateDiagnostics();
      setLoading(false);
      setStatus('Aim at a bird');startMotion(token);frame(token);
    } else if(data.type==='geometry') {
      if((data.scopeRevision ?? 0)!==scopeRevision)return;
      if(performance.now()-data.timestamp>1500 || data.width!==video.videoWidth || data.height!==video.videoHeight)return;
      lastResult=performance.now();reconcile(data.detections,data.timestamp,true);
    } else if(data.type==='result') {
      clearTimeout(watchdog);pending=false;
      if((data.scopeRevision ?? 0)!==scopeRevision){scheduleAnalysis(token);return;}
      scheduler.observeAnalysis(performance.now()-data.timestamp);
      if(performance.now()-data.timestamp>10000 || data.width!==video.videoWidth || data.height!==video.videoHeight) {tracks=[];tracker.clear();overlays.replaceChildren();scheduleAnalysis(token);return;}
      lastResult=performance.now();lastLatency=data.latencyMs;reconcile(data.detections,data.timestamp);
      analysisTimes.push(performance.now());updateDiagnostics();scheduleAnalysis(token);
      const names=[...new Set(tracks.map(t=>species.get(t.speciesId)?.commonName).filter(Boolean))];
      const uncertain=tracks.length && tracks.every(t=>t.history.length && t.history.at(-1)===null);
      setStatus(names.length?'Species matched':uncertain?'Try a clearer view':tracks.length?'Hold steady · Identifying':'Aim at a bird');
    } else if(data.type==='error') fail(data.message);
  };
  worker.onerror=event=>{event.preventDefault();if(token===generation) fail('Local analysis stopped unexpectedly.');};
  watchdog=setTimeout(()=>{if(token===generation&&!ready) fail('Model loading took too long. Check your connection if this is the first start.');},90000);
  try {worker.postMessage({type:'init',scope:scopeControl.value,scopeRevision});} catch {fail('Local analysis could not start.');}
}
async function begin() {
  halt();const token=generation;start.disabled=true;message.textContent='Starting camera…';
  stop.textContent='Stop camera';stop.setAttribute('aria-pressed','true');setStatus('Starting camera…');
  if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {halt('Camera access needs HTTPS and a supported browser.');return;}
  try {
    const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:30,max:30}}});
    if(token!==generation) {camera.getTracks().forEach(t=>t.stop());return;}
    stream=camera;video.srcObject=camera;await video.play();
    if(token!==generation) return;
    welcome.hidden=true;document.body.classList.add('birds-running');stop.focus({preventScroll:true});
    camera.getVideoTracks()[0].addEventListener('ended',()=>{if(stream===camera) halt('Camera interrupted. Resume when ready.',true);});
    loadModel();
  } catch(error) {
    const explanations={NotAllowedError:'Camera access was denied. Allow camera access in browser settings, then retry.',NotFoundError:'No camera found. Open this page on a phone with a camera.',NotReadableError:'Your camera is in use or unavailable. Close other camera apps, then retry.'};
    if(token===generation) halt(explanations[error.name] || 'The camera could not start. Please retry.');
  }
}
retry.addEventListener('click',()=>{if(stream && stream.getVideoTracks().some(t=>t.readyState==='live'))loadModel();else halt('Camera disconnected. Start the camera to retry.',true);});
scopeControl.addEventListener('change',()=>{
  updateScopeNote();scopeRevision++;
  try {localStorage.setItem('birds-species-scope',scopeControl.value);} catch { /* Keep working without persistence. */ }
  // Keep geometry and camera motion; require fresh naming evidence in the new scope.
  for(const track of tracks){track.history=[];track.speciesId=null;track.confidence=null;}
  render();
  worker?.postMessage({type:'scope',scope:scopeControl.value,scopeRevision});
  if(ready)setStatus('Scope changed · Hold steady');
});
start.addEventListener('click',begin);
stop.addEventListener('click',()=>{if(stream || start.disabled){halt();stop.focus({preventScroll:true});}else begin();});
document.addEventListener('visibilitychange',()=>{if(document.hidden && (stream || start.disabled)) halt('Camera paused. Resume when ready.',true);});
window.addEventListener('pagehide',()=>halt());
new ResizeObserver(render).observe(stage);

new ResizeObserver(()=>{stage.style.setProperty('--birds-toolbar-height',`${toolbar.offsetHeight}px`);render();}).observe(toolbar);

document.fonts?.ready.then(()=>{for(const nodes of overlayNodes.values())nodes.viewport=0;render();});
