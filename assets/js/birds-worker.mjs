import { experimentOption, probabilities, decodeYolox } from './birds-core.mjs?v=20261006-models3';
let ort, detector, classifier, manifest, option, busy=false;
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
  const [width,height]=model.size;canvas.width=width;canvas.height=height;
  const area=width*height;
  ctx.imageSmoothingEnabled=model.resize!=='nearest';
  if(model.resize==='letterbox-bgr') {
    ctx.fillStyle='rgb(114,114,114)';ctx.fillRect(0,0,width,height);
    const ratio=Math.min(width/bitmap.width,height/bitmap.height);
    ctx.drawImage(bitmap,0,0,Math.floor(bitmap.width*ratio),Math.floor(bitmap.height*ratio));
  } else if(crop) ctx.drawImage(bitmap,...crop,0,0,width,height);
  else ctx.drawImage(bitmap,0,0,width,height);
  const rgba=ctx.getImageData(0,0,width,height).data,data=new Float32Array(area*3);
  for(let i=0;i<area;i++) for(let c=0;c<3;c++) {
    data[c*area+i]=model.resize==='letterbox-bgr'?rgba[i*4+2-c]:(rgba[i*4+c]/255-model.mean[c])/model.std[c];
  }
  return new ort.Tensor('float32',data,[1,3,height,width]);
}
async function run(session,model,bitmap,crop) {
  const input=tensor(bitmap,model,crop);
  try { return await session.run({[model.input]:input}); } finally { input.dispose(); }
}
async function analyze(bitmap,timestamp) {
  const started=performance.now();
  const output=await run(detector,manifest.detector,bitmap);
  let detections;
  try { detections=decodeYolox(output[manifest.detector.output].data,manifest.detector,bitmap.width,bitmap.height).slice(0,manifest.experimental.maxBirds || 3); }
  finally { Object.values(output).forEach(t=>t.dispose()); }
  for(const d of detections) {
    d.speciesId=null;d.classified=false;
    if(!classifier) continue;
    const [x1,y1,x2,y2]=d.box;
    if(Math.min((x2-x1)*bitmap.width,(y2-y1)*bitmap.height)<48) continue;
    // Slight context around the detector crop helps avoid clipping identifying features.
    const px=(x2-x1)*.05,py=(y2-y1)*.05;
    const left=Math.max(0,x1-px),top=Math.max(0,y1-py),right=Math.min(1,x2+px),bottom=Math.min(1,y2+py);
    const crop=[left*bitmap.width,top*bitmap.height,(right-left)*bitmap.width,(bottom-top)*bitmap.height];
    const output=await run(classifier,option.classifier,bitmap,crop);
    let ranked;
    try { ranked=probabilities(output[option.classifier.output].data).map((score,index)=>({score,index})).sort((a,b)=>b.score-a.score); }
    finally { Object.values(output).forEach(t=>t.dispose()); }
    if(ranked.length!==manifest.species.length) throw new Error('Classifier labels do not match its output.');
    d.classified=true;
    if(ranked[0].score>=option.classifier.threshold && ranked[0].score-(ranked[1]?.score || 0)>=option.classifier.margin) d.speciesId=manifest.species[ranked[0].index].id;
  }
  postMessage({type:'result',timestamp,detections,width:bitmap.width,height:bitmap.height,latencyMs:performance.now()-started});
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
