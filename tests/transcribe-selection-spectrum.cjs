const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/transcribe.js', 'utf8');
const messages = [];
const state = {audioBuffer: {}, duration: 10, loopStart: 2, loopEnd: 6, lastSpectrumTime: null, analysisId: 0};
const elements = {analyzeSelection: {checked: false}, analysisProgress: {}, frequencyReadout: {}};
const ctx = vm.createContext({state, elements, hasSelection: () => state.loopStart !== null && state.loopEnd - state.loopStart >= .04,
  clamp: (v,a,b) => Math.max(a,Math.min(b,v)), spectrumWindowSeconds: .4, spectrumUpdateIntervalSeconds: .1,
  chordTracker: {reset() {}}, pitchShiftCents: () => 0, formatTime: String, worker: {postMessage: m => messages.push(m)}});
vm.runInContext(source.slice(source.indexOf('  function requestSpectrumAt('),source.indexOf('  function setSelection(')), ctx);
ctx.requestSpectrumAt(3); assert.equal(messages.at(-1).aggregate, false); assert.equal(messages.at(-1).start,2.8);
state.analysisInFlight = false; elements.analyzeSelection.checked = true;
ctx.requestSpectrumAt(3); assert.equal(messages.at(-1).start,2); assert.equal(messages.at(-1).end,6); assert.equal(messages.at(-1).aggregate,true);
state.analysisInFlight = false; ctx.requestSpectrumAt(4); assert.equal(messages.length,2);
state.loopEnd = 7; ctx.requestSpectrumAt(4); assert.equal(messages.at(-1).end,7);
state.analysisInFlight = false; state.loopStart = state.loopEnd = null;
ctx.requestSpectrumAt(4); assert.equal(messages.at(-1).aggregate,false);
const worker = vm.createContext({self:{addEventListener(){}}});
vm.runInContext(fs.readFileSync('assets/js/transcribe-analysis-worker.js','utf8'),worker);
// Different notes in each half must both survive aggregation. Outside audio must not leak in.
const rate=22050, samples=new Float32Array(rate*3);
for(let i=0;i<samples.length;i++) samples[i]=Math.sin(2*Math.PI*(i<rate?440:i<rate*2?880:1760)*i/rate);
worker.samples=samples;
vm.runInContext('audioSamples=samples; audioSampleRate=22050;',worker);
const result=worker.buildSpectrogram(0,2,1,0,0,true);
const at=m=>result.data[(m-24)*16];
assert.equal(result.frames,1); assert(at(69)>.03); assert(at(81)>.03); assert(at(93)<.001);
const isolated=worker.buildSpectrogram(2,3,1,0,0,true);
assert(isolated.data[(93-24)*16]>.03); assert(isolated.data[(81-24)*16]<.001);
console.log('Selection mode, unchanged-range caching, resized/cleared highlight, combined notes, and boundary isolation passed.');
