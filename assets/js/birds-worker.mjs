import { experimentOption, probabilities, decodeYolox, suppress, iou, searchWindows, mapWindowDetection, trackingWindow, cropSharpness } from './birds-core.mjs?v=20261006-responsive1';
let ort, detector, classifier, manifest, option, busy=false,scanIndex=0,detectorMs=60,previous=[],frameSize='',lastFull=-Infinity,cacheId=0;
const inputBuffers=new Map();
const qualityCanvas=new OffscreenCanvas(64,64),qualityCtx=qualityCanvas.getContext('2d',{willReadFrequently:true});
const canvas=new OffscreenCanvas(1,1),ctx=canvas.getContext('2d',{willReadFrequently:true});
async function modelBytes(model) {
  const response=await fetch(`${model.url}?v=${model.sha256.slice(0,12)}`,{cache:'force-cache'});
  if(!response.ok) throw new Error('A local model could not be downloaded.');
  const bytes=await response.arrayBuffer();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(digest!==model.sha256) throw new Error('Model integrity check failed. Reload the page and retry.');
  return bytes;
}
async function initialize(id) {
  const response=await fetch(new URL('../models/birds/manifest.json',import.meta.url),{cache:'no-cache'});
  if(!response.ok) throw new Error('Local model configuration could not be loaded.');
  manifest=await response.json();option=experimentOption(manifest,id);
  postMessage({type:'progress',message:'Loading local bird detector…'});
  ort=await import('./vendor/onnxruntime/ort.webgpu.bundle.min.mjs');
  ort.env.wasm.wasmPaths=new URL('./vendor/onnxruntime/',import.meta.url).href;ort.env.wasm.numThreads=1;
  const detectorBytes=await modelBytes(manifest.detector);
  let classifierBytes;
  if(option.classifier) {
    postMessage({type:'progress',message:`Loading ${option.name.toLowerCase()}…`});
    classifierBytes=await modelBytes(option.classifier);
  }
  postMessage({type:'progress',message:'Preparing local analysis…'});
  let provider='wasm';
  let useGPU=false;
  if(option.classifier?.provider!=='wasm' && navigator.gpu) {
    try { useGPU=!!(await navigator.gpu.requestAdapter()); } catch { /* Use CPU. */ }
  }
  if(useGPU) {
    try {
      detector=await ort.InferenceSession.create(detectorBytes,{executionProviders:['webgpu']});
      if(classifierBytes) classifier=await ort.InferenceSession.create(classifierBytes,{executionProviders:['webgpu']});
      provider='webgpu';
    } catch { await detector?.release();await classifier?.release();detector=null;classifier=null; }
  }
  if(!detector) {
    detector=await ort.InferenceSession.create(detectorBytes,{executionProviders:['wasm']});
    if(classifierBytes) classifier=await ort.InferenceSession.create(classifierBytes,{executionProviders:['wasm']});
  }
  postMessage({type:'ready',species:manifest.species,provider,option:option.id});
}
function tensor(bitmap,model,crop) {
  const [width,height]=model.size;if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
  const area=width*height;
  // Smooth moderate upscales only; very tiny/large crops retain upstream nearest resize.
  const shortSide=crop?Math.min(crop[2],crop[3]):Infinity;
  ctx.imageSmoothingEnabled=model.resize!=='nearest' || (shortSide>=64 && shortSide<=160);ctx.imageSmoothingQuality='high';
  if(model.resize==='letterbox-bgr') {
    ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,width,height);
    const source=crop || [0,0,bitmap.width,bitmap.height];
    const ratio=Math.min(width/source[2],height/source[3]);
    ctx.drawImage(bitmap,...source,0,0,Math.floor(source[2]*ratio),Math.floor(source[3]*ratio));
  } else if(crop) ctx.drawImage(bitmap,...crop,0,0,width,height);
  else ctx.drawImage(bitmap,0,0,width,height);
  const rgba=ctx.getImageData(0,0,width,height).data,key=`${width}x${height}`;
  let data=inputBuffers.get(key);if(!data){data=new Float32Array(area*3);inputBuffers.set(key,data);}
  for(let i=0;i<area;i++) for(let c=0;c<3;c++) {
    data[c*area+i]=model.resize==='letterbox-bgr'?rgba[i*4+2-c]:(rgba[i*4+c]/255-model.mean[c])/model.std[c];
  }
  return new ort.Tensor('float32',data,[1,3,height,width]);
}
async function run(session,model,bitmap,crop) {
  const input=tensor(bitmap,model,crop);
  try { return await session.run({[model.input]:input}); } finally { input.dispose(); }
}
async function detect(bitmap,window) {
  const started=performance.now(),output=await run(detector,manifest.detector,bitmap,window);
  try {
    const found=decodeYolox(output[manifest.detector.output].data,manifest.detector,window?.[2] || bitmap.width,window?.[3] || bitmap.height);
    return window?found.map(d=>mapWindowDetection(d,window,bitmap.width,bitmap.height)).filter(Boolean):found;
  } finally {
    Object.values(output).forEach(t=>t.dispose());
    detectorMs=.7*detectorMs+.3*(performance.now()-started);
  }
}
async function analyze(bitmap,timestamp) {
  const started=performance.now(),size=`${bitmap.width}x${bitmap.height}`;
  if(size!==frameSize) {previous=[];scanIndex=0;frameSize=size;}
  const windows=searchWindows(bitmap.width,bitmap.height);
  // Frequent geometry, modest rotating discovery work, and one classifier at most.
  const budget=Math.max(1,Math.min(2,Math.floor(90/Math.max(1,detectorMs))));
  let found=[],passes=0;
  if(!previous.length || timestamp-lastFull>=500) {found=await detect(bitmap);passes++;lastFull=timestamp;}
  for(const bird of previous) {
    if(found.some(d=>iou(d.box,bird.box)>.35)) continue;
    found.push(...await detect(bitmap,trackingWindow(bird.box,bitmap.width,bitmap.height)));passes++;
  }
  const sendGeometry=()=>postMessage({type:'geometry',timestamp,detections:suppress(found).slice(0,manifest.experimental.maxBirds || 3),width:bitmap.width,height:bitmap.height,latencyMs:performance.now()-started});
  sendGeometry();
  for(let i=0;i<budget;i++) {
    found.push(...await detect(bitmap,windows[scanIndex%windows.length]));scanIndex++;passes++;
  }
  const detections=suppress(found).slice(0,manifest.experimental.maxBirds || 3),used=new Set();
  sendGeometry();
  for(const d of detections) {
    const match=previous.filter(p=>!used.has(p.cacheId)&&iou(p.box,d.box)>.25).sort((a,b)=>iou(b.box,d.box)-iou(a.box,d.box))[0];
    if(match) {used.add(match.cacheId);Object.assign(d,{cacheId:match.cacheId,lastClass:match.lastClass,suggestion:match.suggestion,bestSharp:match.bestSharp,sharpAt:match.sharpAt,samples:match.samples});}
    else d.cacheId=++cacheId;
  }
  previous=detections;
  let classifiedThisFrame=false;
  const ordered=[...detections].sort((a,b)=>(a.lastClass ?? -Infinity)-(b.lastClass ?? -Infinity));
  for(const d of ordered) {
    d.speciesId=timestamp-(d.lastClass ?? -Infinity)<2000?d.suggestion:null;d.classificationFresh=false;d.classified=false;
    if(!classifier) continue;
    const [x1,y1,x2,y2]=d.box;
    if(Math.min((x2-x1)*bitmap.width,(y2-y1)*bitmap.height)<24) continue;
    // Slight context around the detector crop helps avoid clipping identifying features.
    const px=(x2-x1)*.05,py=(y2-y1)*.05;
    const left=Math.max(0,x1-px),top=Math.max(0,y1-py),right=Math.min(1,x2+px),bottom=Math.min(1,y2+py);
    const crop=[left*bitmap.width,top*bitmap.height,(right-left)*bitmap.width,(bottom-top)*bitmap.height];
    qualityCtx.imageSmoothingEnabled=true;qualityCtx.drawImage(bitmap,...crop,0,0,64,64);
    const sharp=cropSharpness(qualityCtx.getImageData(0,0,64,64).data,64,64);
    if(!d.sharpAt || timestamp-d.sharpAt>2000) {d.bestSharp=sharp;d.sharpAt=timestamp;}
    else d.bestSharp=Math.max(sharp,d.bestSharp*.97);
    d.samples=(d.samples || 0)+1;
    // Collect a second sample; skip blurred frames while keeping detector geometry live.
    if(d.samples<2 || sharp<Math.max(1,d.bestSharp*.7) || timestamp-(d.lastClass ?? -Infinity)<800 || classifiedThisFrame) continue;
    const output=await run(classifier,option.classifier,bitmap,crop);classifiedThisFrame=true;
    let ranked;
    try { ranked=probabilities(output[option.classifier.output].data).map((score,index)=>({score,index})).sort((a,b)=>b.score-a.score); }
    finally { Object.values(output).forEach(t=>t.dispose()); }
    if(ranked.length!==manifest.species.length) throw new Error('Classifier labels do not match its output.');
    d.classified=true;d.classificationFresh=true;d.speciesId=null;d.lastClass=timestamp;
    if(ranked[0].score>=option.classifier.threshold && ranked[0].score-(ranked[1]?.score || 0)>=option.classifier.margin) d.speciesId=manifest.species[ranked[0].index].id;
    d.suggestion=d.speciesId;
  }
  postMessage({type:'result',timestamp,detections,width:bitmap.width,height:bitmap.height,scanPasses:passes,latencyMs:performance.now()-started});
}
self.onmessage=async({data})=>{
  if(data.type==='init') {
    try { await initialize(data.option); } catch(error) { postMessage({type:'error',message:error.message}); }
  } else if(data.type==='frame') {
    if(busy || !detector) {data.bitmap.close();return;}
    busy=true;
    try { await analyze(data.bitmap,data.timestamp); }
    catch(error) { postMessage({type:'error',message:`Local analysis stopped: ${error.message}`}); }
    finally {data.bitmap.close();busy=false;}
  }
};
