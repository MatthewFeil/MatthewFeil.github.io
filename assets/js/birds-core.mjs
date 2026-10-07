export function coverGeometry(sourceWidth, sourceHeight, width, height) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return { scale, offsetX: (width - sourceWidth * scale) / 2, offsetY: (height - sourceHeight * scale) / 2 };
}
export function projectBox(box, sourceWidth, sourceHeight, width, height) {
  const g = coverGeometry(sourceWidth, sourceHeight, width, height);
  const x1 = Math.max(0, box[0] * sourceWidth * g.scale + g.offsetX);
  const y1 = Math.max(0, box[1] * sourceHeight * g.scale + g.offsetY);
  const x2 = Math.min(width, box[2] * sourceWidth * g.scale + g.offsetX);
  const y2 = Math.min(height, box[3] * sourceHeight * g.scale + g.offsetY);
  return x2 > x1 && y2 > y1 ? { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } : null;
}
export function iou(a, b) {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = r => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
  return intersection / (area(a) + area(b) - intersection || 1);
}
export function probabilities(logits) {
  const max = Math.max(...logits), values = Array.from(logits, x => Math.exp(x - max));
  const sum = values.reduce((a,b) => a+b, 0);
  return values.map(x => x / sum);
}
export function suppress(detections, threshold = .45) {
  const kept = [];
  for (const detection of [...detections].sort((a,b) => b.score - a.score)) {
    if (!kept.some(other => iou(other.box, detection.box) > threshold)) kept.push(detection);
    if (kept.length === 8) break;
  }
  return kept;
}
export class BirdTracker {
  constructor(maxGapMs = 1200) { this.tracks = []; this.nextId = 1; this.maxGapMs = maxGapMs; }
  update(detections, timestamp, geometryOnly = false) {
    const previous = this.tracks.filter(t => timestamp - t.seen <= this.maxGapMs), used = new Set();
    this.tracks = detections.map(d => {
      let match, overlap = .25;
      for (const t of previous) if (!used.has(t.id) && iou(t.box, d.box) > overlap) { match=t; overlap=iou(t.box,d.box); }
      if (match) used.add(match.id);
      const evidence = !geometryOnly && d.classificationFresh !== false;
      const history = evidence ? [...(match?.history || []), d.speciesId || null].slice(-4) : [...(match?.history || [])];
      const suggestion = geometryOnly ? match?.speciesId : d.speciesId;
      const speciesId = suggestion && history.filter(id => id === suggestion).length >= 3 ? suggestion : null;
      return { ...d, id: match?.id || this.nextId++, seen: timestamp, history, speciesId, box: match ? d.box.map((v,i) => .9*v + .1*match.box[i]) : d.box };
    });
    return this.tracks;
  }
  clear() { this.tracks = []; }
}
export function assertRelease(manifest) {
  if (manifest.release?.approved !== true) throw new Error('Local identification models have not passed validation yet.');
  if (!manifest.detector || !manifest.classifier || !Array.isArray(manifest.species) || !manifest.species.length) throw new Error('The local model package is incomplete.');
  for (const model of [manifest.detector, manifest.classifier]) {
    if (!/^\/assets\/models\/birds\/[^?#]+\.onnx$/.test(model.url) || !/^[a-f0-9]{64}$/.test(model.sha256)) throw new Error('Invalid local model asset.');
  }
  const ids = manifest.species.map(s => s.id);
  if (new Set(ids).size !== ids.length || manifest.species.some(s => !s.id || !s.commonName || !s.scientificName)) throw new Error('Invalid species labels.');
  for (const model of [manifest.detector, manifest.classifier]) {
    if (!model.input || !Array.isArray(model.size) || model.size.length !== 2 || !model.size.every(n => Number.isInteger(n) && n > 0 && n <= 2048) || !Array.isArray(model.mean) || model.mean.length !== 3 || !model.mean.every(Number.isFinite) || !Array.isArray(model.std) || model.std.length !== 3 || !model.std.every(n => Number.isFinite(n) && n > 0) || !(model.threshold > 0 && model.threshold <= 1)) throw new Error('Invalid model preprocessing.');
  }
  if (!manifest.detector.boxes || !manifest.detector.scores || !manifest.detector.labels || !Number.isInteger(manifest.detector.birdClass) || !manifest.classifier.output || !(manifest.classifier.margin >= 0 && manifest.classifier.margin <= 1)) throw new Error('Invalid model outputs.');
  const gates = manifest.release;
  if (!(gates.precision >= .9 && gates.coverage >= .7 && gates.latencyMs <= 3000 && gates.realPhonesVerified === true && gates.commercialUseReviewed === true)) throw new Error('The local models have not met the release requirements.');
}

// Unlisted experiments can run without pretending to have passed production gates.
export function experimentOption(manifest, id) {
  if (manifest.experimental?.enabled !== true || !Array.isArray(manifest.options)) throw new Error('Local model experiments are disabled.');
  const option = manifest.options.find(value => value.id === id);
  if (!option || !manifest.detector || !Array.isArray(manifest.species)) throw new Error('This local model option is unavailable.');
  for (const model of [manifest.detector, option.classifier].filter(Boolean)) {
    if (!/^\/assets\/models\/birds\/[^?#]+\.onnx$/.test(model.url) || !/^[a-f0-9]{64}$/.test(model.sha256)) throw new Error('Invalid local model asset.');
    if (!model.input || !model.output || !Array.isArray(model.size) || model.size.length!==2 || !model.size.every(n=>Number.isInteger(n)&&n>0&&n<=2048) || !Array.isArray(model.mean) || model.mean.length!==3 || !model.mean.every(Number.isFinite) || !Array.isArray(model.std) || model.std.length!==3 || !model.std.every(n=>Number.isFinite(n)&&n>0) || !(model.threshold>0&&model.threshold<=1)) throw new Error('Invalid experimental preprocessing.');
  }
  if (manifest.detector.format!=='yolox' || manifest.detector.birdClass!==14 || manifest.detector.strides?.join(',')!=='8,16,32') throw new Error('Unsupported experimental detector.');
  if (option.classifier && (!manifest.species.length || manifest.species.some(s=>!s.id||!s.commonName) || new Set(manifest.species.map(s=>s.id)).size!==manifest.species.length || !(option.classifier.margin>=0&&option.classifier.margin<=1))) throw new Error('Invalid experimental species labels.');
  return option;
}
export function decodeYolox(data, config, sourceWidth, sourceHeight) {
  const [width,height]=config.size, ratio=Math.min(width/sourceWidth,height/sourceHeight), found=[];
  let row=0;
  for(const stride of config.strides) {
    for(let y=0;y<height/stride;y++) for(let x=0;x<width/stride;x++,row++) {
      const offset=row*85;
      if(offset+84>=data.length) throw new Error('Unexpected detector output size.');
      const score=data[offset+4]*data[offset+5+config.birdClass];
      if(score<config.threshold || !Number.isFinite(score)) continue;
      const cx=(data[offset]+x)*stride,cy=(data[offset+1]+y)*stride;
      const w=Math.exp(data[offset+2])*stride,h=Math.exp(data[offset+3])*stride;
      const box=[(cx-w/2)/ratio/sourceWidth,(cy-h/2)/ratio/sourceHeight,(cx+w/2)/ratio/sourceWidth,(cy+h/2)/ratio/sourceHeight].map(n=>Math.max(0,Math.min(1,n)));
      if(box.every(Number.isFinite)&&box[2]>box[0]&&box[3]>box[1]) found.push({box,score});
    }
  }
  if(row*85!==data.length) throw new Error('Unexpected detector output shape.');
  return suppress(found);
}

// Square overlapping windows preserve more detector pixels than a full landscape frame.
export function searchWindows(width, height) {
  const windows=[];
  for(const fraction of [.65,.35]) {
    const side=Math.max(1,Math.round(Math.min(width,height)*fraction));
    const positions=length=>{
      const count=Math.max(1,Math.ceil((length-side)/(side*.75)));
      return Array.from({length:count+1},(_,i)=>Math.round((length-side)*i/count));
    };
    for(const y of positions(height)) for(const x of positions(width)) windows.push([x,y,side,side]);
  }
  return windows;
}
export function mapWindowDetection(detection, window, width, height) {
  const [x,y,w,h]=window,b=detection.box;
  // Reject cut-off birds at interior tile edges; overlapping windows cover those edges.
  if((x>0&&b[0]<.015)||(y>0&&b[1]<.015)||(x+w<width&&b[2]>.985)||(y+h<height&&b[3]>.985)) return null;
  return {...detection,box:[(x+b[0]*w)/width,(y+b[1]*h)/height,(x+b[2]*w)/width,(y+b[3]*h)/height]};
}
export function trackingWindow(box,width,height) {
  const side=Math.min(Math.min(width,height),Math.max(Math.min(width,height)*.18,(box[2]-box[0])*width*2,(box[3]-box[1])*height*2));
  const x=Math.max(0,Math.min(width-side,(box[0]+box[2])*width/2-side/2));
  const y=Math.max(0,Math.min(height-side,(box[1]+box[3])*height/2-side/2));
  return [Math.round(x),Math.round(y),Math.round(side),Math.round(side)];
}

// Variance of the luminance Laplacian on a small crop: relative blur signal, not accuracy.
export function cropSharpness(rgba,width,height) {
  const gray=new Float32Array(width*height);
  for(let i=0;i<gray.length;i++)gray[i]=.299*rgba[i*4]+.587*rgba[i*4+1]+.114*rgba[i*4+2];
  let sum=0,squares=0,count=0;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++) {
    const i=y*width+x,v=gray[i-1]+gray[i+1]+gray[i-width]+gray[i+width]-4*gray[i];
    sum+=v;squares+=v*v;count++;
  }
  return count?Math.max(0,squares/count-(sum/count)**2):0;
}
