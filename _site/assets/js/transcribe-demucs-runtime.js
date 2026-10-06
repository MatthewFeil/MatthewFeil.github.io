/* Pinned local ONNX inference; used by highlighted-segment separation. */
(() => {
const modelUrl = 'https://huggingface.co/StemSplitio/htdemucs-6s-onnx/resolve/49df9b6989cf2150840ea65b0bef77a2e471b678/htdemucs_6s_fp16weights.onnx';
const modelHash = '7ce55792e2231c93fbf92de95f5fd5b3a5e6c89f7db690dfd693e8f1dce56869';
let progress = () => {};
async function loadModel() {
  let cache = null, response = null;
  try { cache = await caches.open('transcribe-demucs-6s-v1'); response = await cache.match(modelUrl); } catch { /* Private browsing or quota: downloading still works. */ }
  if (!response) {
    progress('Downloading six-stem model · 136 MB. Audio stays on this device.');
    response = await fetch(modelUrl, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw Error('The model download failed. Check your connection and try again.');
    if (cache) {
      try { await cache.put(modelUrl, response.clone()); } catch { /* Continue without persistent cache. */ }
    }
  } else progress('Loading the cached six-stem model…');
  const bytes = await response.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  if (digest !== modelHash) {
    await cache?.delete(modelUrl);
    throw Error('The model download is incomplete or invalid. Try again.');
  }
  return bytes;
}
let session, ort;
async function infer(input) {
  if (!session) {
    ort = await import('../vendor/onnxruntime/ort.wasm.min.mjs');
    ort.env.wasm.numThreads = 1;
    const bytes = await loadModel();
    progress('Preparing six-stem separation on this device…');
    session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'], graphOptimizationLevel: 'disabled',
      enableCpuMemArena: false, enableMemPattern: false
    });
  }
  const tensor = new ort.Tensor('float32', input, [1,2,343980]);
  let result;
  try {
    result = await session.run({mix:tensor});
    if (result.stems?.dims.join(',') !== '1,6,2,343980') throw Error('Unexpected six-stem model output.');
    return new Float32Array(result.stems.data);
  } finally {
    tensor.dispose();
    if (result) for (const value of Object.values(result)) value.dispose();
  }
}
async function separate(channels, report) {
  progress = report;
  const inputRms = TranscribeStemAudio.rms(channels);
  if (inputRms < 1e-7) return TranscribeStemAudio.names.map(() => channels.map(c => new Float32Array(c.length)));
  return TranscribeStemAudio.separate(channels, infer, (part,count) => report(`Separating · part ${part+1} of ${count}`,part/count));
}
globalThis.TranscribeDemucs = {separate,release:async()=>{if(session)await session.release();session=null;}};
})();
