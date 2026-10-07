import { BirdTracker, projectBox } from './birds-core.mjs';
const app = document.querySelector('[data-birds-app]');
const video=app.querySelector('video'), stage=app.querySelector('.birds-stage'), overlays=app.querySelector('.birds-overlays');
const welcome=app.querySelector('.birds-welcome'), message=app.querySelector('.birds-message'), toolbar=app.querySelector('.birds-toolbar');
const start=app.querySelector('.birds-start'), stop=app.querySelector('.birds-stop'), status=app.querySelector('.birds-status');
const tracker = new BirdTracker();
let stream, worker, generation=0, ready=false, pending=false, timer, watchdog, lastResult=0, species=new Map(), tracks=[];
function setStatus(text) { if (status.textContent!==text) status.textContent=text; }
function render() {
  overlays.replaceChildren();
  if (!video.videoWidth || performance.now()-lastResult>1500) return;
  const width=stage.clientWidth, height=stage.clientHeight, bottom=height-toolbar.offsetHeight;
  for (const track of tracks) {
    const rect=projectBox(track.box,video.videoWidth,video.videoHeight,width,height);
    if (!rect || rect.y>=bottom) continue;
    const box=document.createElement('div'); box.className='birds-box';
    Object.assign(box.style,{left:`${rect.x}px`,top:`${rect.y}px`,width:`${rect.width}px`,height:`${Math.min(rect.height,bottom-rect.y)}px`});
    const label=document.createElement('span'); label.className='birds-label';
    label.textContent=species.get(track.speciesId)?.commonName || 'Bird · uncertain';
    overlays.append(box,label);
    label.style.maxWidth=`${Math.min(256,width)}px`;
    const x=Math.max(0, Math.min(rect.x,width-label.offsetWidth));
    const y=Math.max(0,Math.min(rect.y-label.offsetHeight,bottom-label.offsetHeight));
    label.style.left=`${x}px`; label.style.top=`${y}px`;
  }
}
function halt(text='Camera images stay on your device.', resume=false) {
  generation++; clearTimeout(timer); clearTimeout(watchdog); worker?.terminate(); worker=null;
  stream?.getTracks().forEach(track=>track.stop()); stream=null; video.srcObject=null;
  ready=false; pending=false; tracker.clear(); tracks=[]; overlays.replaceChildren();
  document.body.classList.remove('birds-running'); toolbar.hidden=true; welcome.hidden=false;
  start.disabled=false; start.textContent=resume?'Resume camera':'Start camera'; message.textContent=text;
}
async function frame(token) {
  if (token!==generation || !ready || !stream) return;
  if (!pending && video.readyState>=2) {
    pending=true;
    try {
      const bitmap=await createImageBitmap(video);
      if (token!==generation || !worker) { bitmap.close(); return; }
      worker.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
      watchdog=setTimeout(()=>{ready=false;clearTimeout(timer);tracks=[];overlays.replaceChildren();setStatus('Camera only. Identification stalled. Stop and retry.');worker?.terminate();worker=null;},15000);
    } catch { pending=false; setStatus('Frame unavailable. Hold steady.'); }
  }
  if (performance.now()-lastResult>1500) { tracks=[]; overlays.replaceChildren(); }
  timer=setTimeout(()=>frame(token),500);
}
async function begin() {
  halt(); const token=generation; start.disabled=true; message.textContent='Starting camera…';
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { halt('Camera access needs HTTPS and a supported browser.'); return; }
  try {
    const camera=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});
    if (token!==generation) { camera.getTracks().forEach(t=>t.stop()); return; }
    stream=camera; video.srcObject=camera;
    await video.play();
    if (token!==generation) return;
    welcome.hidden=true; toolbar.hidden=false; document.body.classList.add('birds-running');
    stop.focus({preventScroll:true}); setStatus('Loading local identification…');
    camera.getVideoTracks()[0].addEventListener('ended',()=>{ if (token===generation) halt('Camera interrupted. Resume when ready.',true); });
    worker=new Worker(new URL('./birds-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if (token!==generation) return;
      if (data.type==='ready') { clearTimeout(watchdog); species=new Map(data.species.map(s=>[s.id,s])); ready=true; lastResult=performance.now(); setStatus('Aim at a bird'); frame(token); }
      else if (data.type==='result') {
        clearTimeout(watchdog); pending=false;
        if (performance.now()-data.timestamp>1500 || data.width!==video.videoWidth || data.height!==video.videoHeight) { tracks=[]; tracker.clear(); overlays.replaceChildren(); return; }
        lastResult=performance.now(); tracks=tracker.update(data.detections,data.timestamp); render();
        const names=[...new Set(tracks.map(t=>species.get(t.speciesId)?.commonName).filter(Boolean))];
        setStatus(names.length?names.join(', '):tracks.length?'Hold steady':'Aim at a bird');
      } else if (data.type==='error') { clearTimeout(watchdog); ready=false; clearTimeout(timer); tracks=[]; overlays.replaceChildren(); setStatus(`Camera only. ${data.message}`); worker?.terminate(); worker=null; }
    };
    worker.onerror=()=>{ clearTimeout(watchdog); ready=false; clearTimeout(timer); tracks=[]; overlays.replaceChildren(); setStatus('Camera only. Local identification could not start.'); worker?.terminate(); worker=null; };
    watchdog=setTimeout(()=>{ if(token===generation && !ready) { setStatus('Camera only. Local identification took too long to load. Stop and retry.'); worker?.terminate(); worker=null; } },30000);
    worker.postMessage({type:'init'});
  } catch(error) {
    const explanations={NotAllowedError:'Camera access was denied. Allow camera access in your browser settings, then retry.',NotFoundError:'No camera found. Open this page on a phone with a camera.',NotReadableError:'Your camera is in use or unavailable. Close other camera apps, then retry.'};
    if(token===generation) halt(explanations[error.name] || 'The camera could not start. Please retry.');
  }
}
start.addEventListener('click',begin);
stop.addEventListener('click',()=>{halt();start.focus({preventScroll:true});});
document.addEventListener('visibilitychange',()=>{if(document.hidden && (stream || start.disabled)) halt('Camera paused. Resume when ready.',true);});
window.addEventListener('pagehide',()=>halt());
new ResizeObserver(render).observe(stage);
