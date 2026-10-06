// Run with node tests/transcribe-spectrum-cadence.cjs.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/transcribe.js', 'utf8');
function setup() {
  let now = 0, hidden = false, spectrumHidden = false, resets = 0;
  const messages = [];
  const state = {audioBuffer: {}, duration: 100, analysisId: 0, pendingSpectrumTime: null, nextSpectrumUpdateAt: 0};
  const elements = {audio: {paused: false}, analyzeSelection: {checked: false}, analysisProgress: {}, frequencyReadout: {}, noteTolerance: {value: '0.45'}};
  const context = vm.createContext({state, elements, detectionSettings: {mode: 'balanced'}, noteTracker: {reset() {}}, spectrumUpdateIntervalMs: 1000 / 30, spectrumWindowSeconds: .4,
    performance: {now: () => now}, document: {get hidden() {return hidden}, getElementById: () => ({hidden: spectrumHidden})},
    hasSelection: () => state.loopStart != null, chordTracker: {reset() {resets++}},
    clamp: (v,a,b) => Math.max(a,Math.min(b,v)), pitchShiftCents: () => 0, formatTime: String,
    worker: {postMessage: m => messages.push(m)}, transport: {currentTime: 0}});
  vm.runInContext(source.slice(source.indexOf('  function requestSpectrumAt('), source.indexOf('  function setSelection(')), context);
  return {state,elements,context,messages,setNow: n => now=n,hide: () => hidden=true,hideSpectrum: () => spectrumHidden=true,resets: () => resets};
}
// At 60 and 120 Hz, real-time cadence stays the same even when audio time changes slowly.
for (const fps of [60,120]) for (const speed of [.25,.5,1,2]) {
  const t=setup();
  for(let frame=0;frame<fps*2;frame++) {
    t.setNow(frame*1000/fps); t.context.requestSpectrumAt(frame/fps*speed); t.state.analysisInFlight=false;
  }
  assert.equal(t.messages.length,60,`${fps} Hz display, ${speed} playback rate`);
  assert.equal(t.resets(),0,'Periodic requests preserve note/chord history');
}
const t=setup();t.context.requestSpectrumAt(1);
for(let i=1;i<=10;i++){t.setNow(i*16);t.context.requestSpectrumAt(1+i*.1)}
assert.equal(t.messages.length,1,'Busy worker does not receive queued jobs');
assert.equal(t.state.pendingSpectrumTime,2,'Pending request tracks the latest playhead');
t.context.requestSpectrumAt(5,true);assert(t.state.spectrumRequestInvalidated);assert(t.state.pendingSpectrumForce);
t.context.requestSpectrumAt(5.1);assert(t.state.pendingSpectrumForce,'Periodic updates cannot erase a forced refresh');
t.state.analysisInFlight=false;t.context.requestSpectrumAt(5.1,true);
assert.equal(t.messages.length,2);assert.equal(t.state.pendingSpectrumTime,null);
t.state.analysisInFlight=false;t.setNow(10000);t.context.requestSpectrumAt(9);
t.context.requestSpectrumAt(9.1);t.state.analysisInFlight=false;t.context.requestSpectrumAt(9.2);
assert.equal(t.messages.length,3,'Long stalls never produce catch-up bursts');
for(const hide of ['hide','hideSpectrum']) {const x=setup();x[hide]();x.context.requestSpectrumAt(1);x.context.requestSpectrumAt(2,true);assert.equal(x.messages.length,0)}
const p=setup();p.elements.audio.paused=true;p.context.requestSpectrumAt(1,true);p.state.analysisInFlight=false;p.setNow(100);p.context.requestSpectrumAt(1);assert.equal(p.messages.length,1);
console.log('30 Hz cadence at all speeds, bounded/latest pending work, forced invalidation, stalls, paused and hidden checks passed.');
// Exercise the production result handler: invalidated work must never paint.
const r=setup();let receive,draws=0,prepared=0;
Object.assign(r.context,{
  worker: {addEventListener(type, listener){receive=listener},postMessage: m=>r.messages.push(m)},
  renderAll(){},drawSpectrogram(){draws++},updateSpectrumNotes(){prepared++;r.state.likelyNotes=[]},
  resetPitchReadout(){},updatePitchReadout(){},midiToName: String
});
const receiveStart=source.indexOf("  worker.addEventListener('message',");
vm.runInContext(source.slice(receiveStart,source.indexOf("  elements.fileName.addEventListener",receiveStart)),r.context);
r.context.requestSpectrumAt(1);const oldId=r.state.analysisId;
r.context.requestSpectrumAt(5,true);
receive({data:{type:'spectrogram',id:oldId,center:1,data:new Float32Array(1152),frames:1}});
assert.equal(draws,0,'A seek invalidates the old result before painting');assert.equal(r.messages.length,2);
assert.equal(r.messages.at(-1).center,5);
receive({data:{type:'spectrogram',id:oldId,center:1}});assert.equal(draws,0,'Old message IDs cannot replace current work');
receive({data:{type:'spectrogram',id:r.state.analysisId,center:5,data:new Float32Array(1152),frames:1}});
assert.equal(draws,1,'Completed analysis paints exactly once');assert.equal(prepared,1);
r.context.requestSpectrumAt(6,true);r.hideSpectrum();
receive({data:{type:'spectrogram',id:r.state.analysisId,center:6}});
assert.equal(draws,1,'A result received after hiding the spectrum does not paint');assert.equal(r.state.analysisInFlight,false);
console.log('Stale/invalidated result rejection, one draw per result, and hide-during-analysis checks passed.');
