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
  constructor() { this.tracks = []; this.nextId = 1; }
  update(detections, timestamp) {
    const previous = this.tracks.filter(t => timestamp - t.seen <= 1200), used = new Set();
    this.tracks = detections.map(d => {
      let match, overlap = .25;
      for (const t of previous) if (!used.has(t.id) && iou(t.box, d.box) > overlap) { match=t; overlap=iou(t.box,d.box); }
      if (match) used.add(match.id);
      const history = [...(match?.history || []), d.speciesId || null].slice(-4);
      const speciesId = d.speciesId && history.filter(id => id === d.speciesId).length >= 3 ? d.speciesId : null;
      return { ...d, id: match?.id || this.nextId++, seen: timestamp, history, speciesId, box: match ? d.box.map((v,i) => .65*v + .35*match.box[i]) : d.box };
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
