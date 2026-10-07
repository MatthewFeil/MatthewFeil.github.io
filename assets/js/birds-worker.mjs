import { assertRelease, probabilities, suppress } from './birds-core.mjs';
let ort, detector, classifier, manifest, busy = false;
const canvas = new OffscreenCanvas(1, 1), ctx = canvas.getContext('2d', { willReadFrequently: true });
async function modelBytes(model) {
  const response = await fetch(model.url, { cache: 'force-cache' });
  if (!response.ok) throw new Error('A local model could not be downloaded.');
  const bytes = await response.arrayBuffer();
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2,'0')).join('');
  if (digest !== model.sha256) throw new Error('Model integrity check failed.');
  return bytes;
}
async function initialize() {
  const response = await fetch(new URL('../models/birds/manifest.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Local model configuration could not be loaded.');
  manifest = await response.json();
  assertRelease(manifest);
  ort = await import('./vendor/onnxruntime/ort.webgpu.bundle.min.mjs');
  ort.env.wasm.wasmPaths = new URL('./vendor/onnxruntime/', import.meta.url).href;
  ort.env.wasm.numThreads = 1;
  const bytes = await Promise.all([modelBytes(manifest.detector), modelBytes(manifest.classifier)]);
  let provider = 'wasm';
  if (navigator.gpu) {
    try {
      detector = await ort.InferenceSession.create(bytes[0], { executionProviders: ['webgpu'] });
      classifier = await ort.InferenceSession.create(bytes[1], { executionProviders: ['webgpu'] });
      provider = 'webgpu';
    } catch { await detector?.release(); detector = null; }
  }
  if (!detector) {
    detector = await ort.InferenceSession.create(bytes[0], { executionProviders: ['wasm'] });
    classifier = await ort.InferenceSession.create(bytes[1], { executionProviders: ['wasm'] });
  }
  postMessage({ type: 'ready', species: manifest.species, provider });
}
function tensor(bitmap, model, crop) {
  const [width, height] = model.size;
  canvas.width = width; canvas.height = height;
  if (crop) ctx.drawImage(bitmap, ...crop, 0, 0, width, height);
  else ctx.drawImage(bitmap, 0, 0, width, height);
  const rgba = ctx.getImageData(0,0,width,height).data, area = width*height;
  const data = new Float32Array(area*3);
  for (let i=0;i<area;i++) for (let c=0;c<3;c++) data[c*area+i]=(rgba[i*4+c]/255-model.mean[c])/model.std[c];
  return new ort.Tensor('float32', data, [1,3,height,width]);
}
async function analyze(bitmap, timestamp) {
  const config = manifest.detector;
  const detectorInput = tensor(bitmap, config);
  let result;
  try { result = await detector.run({ [config.input]: detectorInput }); } finally { detectorInput.dispose(); }
  const boxes = result[config.boxes].data, scores = result[config.scores].data, labels = result[config.labels].data;
  const found = [];
  for (let i=0;i<scores.length;i++) {
    const box = Array.from(boxes.slice(i*4,i*4+4), value => Math.max(0, Math.min(1, Number(value))));
    if (Number(labels[i]) === config.birdClass && scores[i] >= config.threshold && box[2]>box[0] && box[3]>box[1]) found.push({ box, score: Number(scores[i]) });
  }
  Object.values(result).forEach(value => value.dispose());
  const detections = suppress(found);
  for (const d of detections) {
    const [x1,y1,x2,y2] = d.box;
    const crop = [x1*bitmap.width, y1*bitmap.height, (x2-x1)*bitmap.width, (y2-y1)*bitmap.height];
    d.speciesId = null;
    if (Math.min(crop[2],crop[3]) < 48) continue;
    const config = manifest.classifier;
    const classifierInput = tensor(bitmap, config, crop);
    let output;
    try { output = await classifier.run({ [config.input]: classifierInput }); } finally { classifierInput.dispose(); }
    const ranked = probabilities(output[config.output].data).map((score,index)=>({score,index})).sort((a,b)=>b.score-a.score);
    Object.values(output).forEach(value => value.dispose());
    if (ranked.length === manifest.species.length && ranked[0].score >= config.threshold && ranked[0].score-(ranked[1]?.score || 0) >= config.margin) d.speciesId=manifest.species[ranked[0].index]?.id || null;
  }
  postMessage({ type: 'result', timestamp, detections, width: bitmap.width, height: bitmap.height });
}
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    try { await initialize(); } catch (error) { postMessage({type:'error', message:error.message}); }
  } else if (data.type === 'frame') {
    if (busy || !detector || !classifier) { data.bitmap.close(); return; }
    busy=true;
    try { await analyze(data.bitmap, data.timestamp); }
    catch { postMessage({type:'error', message:'Local identification stopped. Stop the camera and retry.'}); }
    finally { data.bitmap.close(); busy=false; }
  }
};
