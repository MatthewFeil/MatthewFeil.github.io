import { BirdTracker, projectBox } from './birds-core.mjs?v=20261006-models3';
const app=document.querySelector('[data-birds-app]');
const video=app.querySelector('video'),stage=app.querySelector('.birds-stage'),overlays=app.querySelector('.birds-overlays');
const welcome=app.querySelector('.birds-welcome'),message=app.querySelector('.birds-message'),toolbar=app.querySelector('.birds-toolbar');
const start=app.querySelector('.birds-start'),stop=app.querySelector('.birds-stop'),status=app.querySelector('.birds-status');
const selector=app.querySelector('#birds-model'),timing=app.querySelector('.birds-timing');
const tracker=new BirdTracker(10000);
let stream,worker,generation=0,ready=false,pending=false,timer,watchdog,lastResult=0,lastLatency=500,species=new Map(),tracks=[];
const expiry=()=>Math.min(10000,Math.max(3000,lastLatency*2+500));
function setStatus(text) {if(status.textContent!==text) status.textContent=text;}
function clearAnalysis() {
  generation++;clearTimeout(timer);clearTimeout(watchdog);worker?.terminate();worker=null;
  ready=false;pending=false;tracker.clear();tracks=[];overlays.replaceChildren();timing.textContent='';
}
function render() {
  overlays.replaceChildren();
  if(!video.videoWidth || performance.now()-lastResult>expiry()) return;
  const width=stage.clientWidth,height=stage.clientHeight,bottom=height-toolbar.offsetHeight;
  const top=app.querySelector('.birds-modelbar').getBoundingClientRect().bottom-stage.getBoundingClientRect().top;
  for(const track of tracks) {
    const rect=projectBox(track.box,video.videoWidth,video.videoHeight,width,height);
    if(!rect || rect.y>=bottom) continue;
    const box=document.createElement('div');box.className='birds-box';
    Object.assign(box.style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${Math.min(rect.height,bottom-rect.y)}px`});
    const label=document.createElement('span');label.className='birds-label';
    const name=species.get(track.speciesId)?.commonName;
    label.textContent=name?`${name} · tentative`:selector.value==='detect'?'Bird':track.speciesId===null && track.history.some(Boolean)?'Bird · identifying':'Bird · uncertain';
    overlays.append(box,label);label.style.maxWidth=`${Math.min(256,width)}px`;
    label.style.left=`${Math.max(0,Math.min(rect.x,width-label.offsetWidth))}px`;
    label.style.top=`${Math.max(top,Math.min(rect.y-label.offsetHeight,bottom-label.offsetHeight))}px`;
  }
}
function halt(text='Camera images stay on your device.',resume=false) {
  clearAnalysis();
  stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;
  document.body.classList.remove('birds-running');toolbar.hidden=true;welcome.hidden=false;
  start.disabled=false;start.textContent=resume?'Resume camera':'Start camera';message.textContent=text;
}
function fail(text) {clearAnalysis();setStatus(`Camera only. ${text}`);}
async function frame(token) {
  if(token!==generation || !ready || !stream) return;
  if(!pending && video.readyState>=2) {
    pending=true;
    try {
      const bitmap=await createImageBitmap(video);
      if(token!==generation || !worker) {bitmap.close();return;}
      worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
      watchdog=setTimeout(()=>fail('Analysis took too long. Switch models or stop and retry.'),45000);
    } catch {pending=false;setStatus('Frame unavailable. Hold steady.');}
  }
  if(performance.now()-lastResult>expiry()) {tracks=[];overlays.replaceChildren();}
  timer=setTimeout(()=>frame(token),500);
}
function loadOption() {
  clearAnalysis();const token=generation;
  setStatus('Loading selected local model…');
  worker=new Worker(new URL('./birds-worker.mjs?v=20261006-models3',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{
    if(token!==generation) return;
    if(data.type==='progress') setStatus(data.message);
    else if(data.type==='ready') {
      clearTimeout(watchdog);species=new Map(data.species.map(s=>[s.id,s]));ready=true;lastResult=performance.now();lastLatency=500;
      setStatus(selector.value==='detect'?'Aim at a bird · outlines only':'Aim at a bird');frame(token);
    } else if(data.type==='result') {
      clearTimeout(watchdog);pending=false;
      if(performance.now()-data.timestamp>10000 || data.width!==video.videoWidth || data.height!==video.videoHeight) {tracks=[];tracker.clear();overlays.replaceChildren();return;}
      lastResult=performance.now();lastLatency=data.latencyMs;tracks=tracker.update(data.detections,data.timestamp);render();
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
    const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
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
