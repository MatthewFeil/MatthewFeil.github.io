import { BirdTracker, projectBox, iou as overlap } from './birds-core.mjs?v=20261007-small2';
import {advanceByMotion} from './birds-motion.mjs?v=20261007-small2';
const app=document.querySelector('[data-birds-app]');
const video=app.querySelector('video'),stage=app.querySelector('.birds-stage'),overlays=app.querySelector('.birds-overlays');
const welcome=app.querySelector('.birds-welcome'),message=app.querySelector('.birds-message'),toolbar=app.querySelector('.birds-toolbar');
const start=app.querySelector('.birds-start'),stop=app.querySelector('.birds-stop'),status=app.querySelector('.birds-status');
const selector=app.querySelector('#birds-model'),timing=app.querySelector('.birds-timing');
const loading=app.querySelector('.birds-loading'),loadingMessage=app.querySelector('.birds-loading-message');
const tracker=new BirdTracker(10000),overlayNodes=new Map();
const motionCanvas=document.createElement('canvas'),motionCtx=motionCanvas.getContext('2d',{willReadFrequently:true});
let motionWorker,motionPending=false,motionTimer,motionSnapshot=[],motionRate=40;
let stream,worker,generation=0,ready=false,pending=false,timer,watchdog,overlayExpiry,lastResult=0,lastLatency=500,species=new Map(),tracks=[];
const expiry=()=>Math.min(10000,Math.max(3000,lastLatency*2+500));
function setStatus(text) {if(status.textContent!==text) status.textContent=text;if(!loading.hidden) loadingMessage.textContent=text;}
function setLoading(active) {
  loading.hidden=!active;stage.classList.toggle('birds-model-loading',active);stage.setAttribute('aria-busy',String(active));
}
function clearAnalysis() {
  generation++;clearTimeout(motionTimer);motionWorker?.terminate();motionWorker=null;motionPending=false;motionSnapshot=[];clearTimeout(timer);clearTimeout(watchdog);clearTimeout(overlayExpiry);worker?.terminate();worker=null;
  ready=false;pending=false;tracker.clear();tracks=[];overlays.replaceChildren();overlayNodes.clear();timing.textContent='';
  setLoading(false);
}
function render() {
  if(!video.videoWidth || performance.now()-lastResult>expiry()) {overlays.replaceChildren();overlayNodes.clear();return;}
  clearTimeout(overlayExpiry);overlayExpiry=setTimeout(render,Math.max(16,expiry()-(performance.now()-lastResult)+20));
  const active=new Set();
  const width=stage.clientWidth,height=stage.clientHeight,bottom=height-toolbar.offsetHeight;
  const top=app.querySelector('.birds-modelbar').getBoundingClientRect().bottom-stage.getBoundingClientRect().top;
  for(const track of tracks) {
    const rect=projectBox(track.box,video.videoWidth,video.videoHeight,width,height);
    if(!rect || rect.y>=bottom) continue;
    active.add(track.id);
    let nodes=overlayNodes.get(track.id);
    if(!nodes || !nodes.box.isConnected) {
      const box=document.createElement('div'),label=document.createElement('span');
      box.className='birds-box';label.className='birds-label';overlays.append(box,label);
      nodes={box,label,text:null,width:0,height:0,viewport:0};overlayNodes.set(track.id,nodes);
    }
    const {box,label}=nodes;
    Object.assign(box.style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${Math.min(rect.height,bottom-rect.y)}px`});
    const name=species.get(track.speciesId)?.commonName;
    const text=name?`${name} · tentative`:selector.value==='detect'?'Bird':track.speciesId===null && track.history.some(Boolean)?'Bird · identifying':'Bird · uncertain';
    if(nodes.text!==text || nodes.viewport!==width) {
      label.textContent=text;label.style.maxWidth=`${Math.min(256,width)}px`;
      nodes.text=text;nodes.viewport=width;nodes.width=label.offsetWidth;nodes.height=label.offsetHeight;
    }
    label.style.left=`${Math.max(0,Math.min(rect.x,width-nodes.width))}px`;
    label.style.top=`${Math.max(top,Math.min(rect.y-nodes.height,bottom-nodes.height))}px`;
  }
  for(const [id,nodes] of overlayNodes)if(!active.has(id)){nodes.box.remove();nodes.label.remove();overlayNodes.delete(id);}
}
function halt(text='Camera images stay on your device.',resume=false) {
  clearAnalysis();
  stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;
  document.body.classList.remove('birds-running');toolbar.hidden=true;welcome.hidden=false;
  start.disabled=false;start.textContent=resume?'Resume camera':'Start camera';message.textContent=text;
}
function fail(text) {clearAnalysis();setStatus(`Camera only. ${text}`);}
function startMotion(token) {
  motionWorker=new Worker(new URL('./birds-motion-worker.mjs?v=20261007-small2',import.meta.url),{type:'module'});
  motionWorker.onmessage=({data})=>{
    if(token!==generation)return;
    motionPending=false;
    if(performance.now()-data.timestamp<200) {
      for(const update of data.updates) {
        const track=tracks.find(t=>t.id===update.id);
        if(track && !update.lost && performance.now()-track.seen<1200) {
          track.box=track.box.map((v,i)=>Math.max(0,Math.min(1,v+(i%2?update.dy:update.dx))));
          track.flowDx=(track.flowDx||0)+update.dx;track.flowDy=(track.flowDy||0)+update.dy;
        }
        if(track && update.lost)track.motionLost=true;
        else if(track)track.motionLost=false;
      }
      tracks=tracks.filter(t=>performance.now()-t.seen<1200);tracker.tracks=tracks;render();
    }
    motionRate=Math.max(33,Math.min(100,data.latencyMs*2));
    motionTimer=setTimeout(()=>motionFrame(token),Math.max(0,motionRate-data.latencyMs));
  };
  motionWorker.onerror=()=>{motionWorker?.terminate();motionWorker=null;motionPending=false;};
  motionFrame(token);
}
function motionFrame(token) {
  if(token!==generation || !motionWorker || !stream)return;
  if(video.readyState>=2 && !motionPending) {
    const ratio=480/Math.max(video.videoWidth,video.videoHeight),width=Math.round(video.videoWidth*ratio),height=Math.round(video.videoHeight*ratio);
    if(motionCanvas.width!==width)motionCanvas.width=width;if(motionCanvas.height!==height)motionCanvas.height=height;
    motionCtx.drawImage(video,0,0,width,height);
    const rgba=motionCtx.getImageData(0,0,width,height).data;
    motionPending=true;motionWorker.postMessage({type:'frame',rgba,width,height,timestamp:performance.now(),tracks:tracks.map(t=>({id:t.id,box:t.box}))},[rgba.buffer]);
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
  if(!pending && video.readyState>=2) {
    pending=true;
    try {
      const capturedAt=performance.now();motionSnapshot=tracks.map(t=>({id:t.id,cacheId:t.cacheId,box:[...t.box],flowDx:t.flowDx||0,flowDy:t.flowDy||0}));
      const bitmap=await createImageBitmap(video);
      if(token!==generation || !worker) {bitmap.close();return;}
      worker.postMessage({type:'frame',bitmap,timestamp:capturedAt,tracks:motionSnapshot.map(t=>({cacheId:t.cacheId,box:t.box}))},[bitmap]);
      watchdog=setTimeout(()=>fail('Analysis took too long. Switch models or stop and retry.'),45000);
    } catch {pending=false;setStatus('Frame unavailable. Hold steady.');}
  }
  if(performance.now()-lastResult>expiry()) {tracks=[];overlays.replaceChildren();}
  if(!pending) timer=setTimeout(()=>frame(token),120);
}
function loadOption() {
  clearAnalysis();const token=generation;
  setLoading(true);
  setStatus('Loading selected local model…');
  worker=new Worker(new URL('./birds-worker.mjs?v=20261007-small2',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(token!==generation) return;
    if(data.type==='progress') setStatus(data.message);
    else if(data.type==='ready') {
      clearTimeout(watchdog);species=new Map(data.species.map(s=>[s.id,s]));ready=true;lastResult=performance.now();lastLatency=500;
      setLoading(false);
      setStatus(selector.value==='detect'?'Aim at a bird · outlines only':'Aim at a bird');startMotion(token);frame(token);
    } else if(data.type==='geometry') {
      if(performance.now()-data.timestamp>1500 || data.width!==video.videoWidth || data.height!==video.videoHeight)return;
      lastResult=performance.now();reconcile(data.detections,data.timestamp,true);
    } else if(data.type==='result') {
      clearTimeout(watchdog);pending=false;timer=setTimeout(()=>frame(token),Math.max(0,(tracks.length?220:120)-data.latencyMs));
      if(performance.now()-data.timestamp>10000 || data.width!==video.videoWidth || data.height!==video.videoHeight) {tracks=[];tracker.clear();overlays.replaceChildren();return;}
      lastResult=performance.now();lastLatency=data.latencyMs;reconcile(data.detections,data.timestamp);
      timing.textContent=`Last analysis: ${(data.latencyMs/1000).toFixed(2)} s`;
      const names=[...new Set(tracks.map(t=>species.get(t.speciesId)?.commonName).filter(Boolean))];
      setStatus(names.length?`Tentative: ${names.join(', ')}`:tracks.length?(selector.value==='detect'?'Bird detected · outlines only':'Bird detected · hold steady'):'Aim at a bird');
    } else if(data.type==='error') fail(data.message);
  };
  worker.onerror=()=>{if(token===generation) fail('Local analysis could not start. Switch models or retry.');};
  watchdog=setTimeout(()=>{if(token===generation&&!ready) fail('Model loading took too long. Switch models or retry.');},90000);
  worker.postMessage({type:'init',option:selector.value});
}
async function begin() {
  halt();const token=generation;start.disabled=true;message.textContent='Starting camera…';
  if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {halt('Camera access needs HTTPS and a supported browser.');return;}
  try {
    const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:30,max:30}}});
    if(token!==generation) {camera.getTracks().forEach(t=>t.stop());return;}
    stream=camera;video.srcObject=camera;await video.play();
    if(token!==generation) return;
    welcome.hidden=true;toolbar.hidden=false;document.body.classList.add('birds-running');stop.focus({preventScroll:true});
    camera.getVideoTracks()[0].addEventListener('ended',()=>{if(stream===camera) halt('Camera interrupted. Resume when ready.',true);});
    loadOption();
  } catch(error) {
    const explanations={NotAllowedError:'Camera access was denied. Allow camera access in browser settings, then retry.',NotFoundError:'No camera found. Open this page on a phone with a camera.',NotReadableError:'Your camera is in use or unavailable. Close other camera apps, then retry.'};
    if(token===generation) halt(explanations[error.name] || 'The camera could not start. Please retry.');
  }
}
selector.addEventListener('change',()=>{if(stream && document.body.classList.contains('birds-running')) loadOption();});
start.addEventListener('click',begin);
stop.addEventListener('click',()=>{halt();start.focus({preventScroll:true});});
document.addEventListener('visibilitychange',()=>{if(document.hidden && (stream || start.disabled)) halt('Camera paused. Resume when ready.',true);});
window.addEventListener('pagehide',()=>halt());
new ResizeObserver(render).observe(stage);
