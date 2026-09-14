const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({ Float32Array, ArrayBuffer, DataView, console });
vm.runInContext(fs.readFileSync('assets/js/transcribe-stems-core.js', 'utf8'), ctx);
const core = ctx.TranscribeStemAudio;
(async () => {
  for (const length of [1, 9, 16, 17, 28, 45]) {
    const left = Float32Array.from({ length }, (_, i) => (i + 1) / 100);
    const right = Float32Array.from(left, v => -v);
    const result = await core.separate([left, right], async input => {
      const output = new Float32Array(6 * input.length);
      for (let s = 0; s < 6; s++) output.set(Float32Array.from(input, v => v * (s + 1)), s * input.length);
      return output;
    }, () => {}, 16);
    for (let s = 0; s < 6; s++) for (let c = 0; c < 2; c++) for (let i = 0; i < length; i++) {
      assert(Math.abs(result[s][c][i] - [left, right][c][i] * (s + 1)) < 1e-6, 'Overlap-add preserves timing, edges, and source ordering');
    }
    assert(core.mix(result, [false, false, false, false, false, false]).every(c => c.every(v => v === 0)));
    assert.deepEqual(core.mix(result, [true, false, false, false, false, false])[0], result[0][0]);
  }
  assert.equal(core.activity([new Float32Array(100)], .2).quiet, true);
  assert.equal(core.activity([Float32Array.of(.0002, -.0002)], .2).quiet, true);
  assert.equal(core.activity([Float32Array.of(.1, -.1)], .2).quiet, false);
  assert.equal(core.activity([Float32Array.of(.1, -.1)], .2).rms, .10000000149011612, 'Anti-phase samples retain energy');
  assert.throws(() => core.activity([Float32Array.of(NaN)], 1));
  await assert.rejects(core.separate([Float32Array.of(1), Float32Array.of(1)], async () => new Float32Array(1), () => {}, 16));
  const bytes = core.wav([Float32Array.of(-1, .25, 1), Float32Array.of(1, -.25, -1)]), view = new DataView(bytes);
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getInt16(44, true), -32768); assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), 8192); assert.equal(view.getInt16(50, true), -8192);
  // The analysis worker must see the selected mix only at original-track times.
  const workerContext = vm.createContext({Float32Array, self:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync('assets/js/transcribe-analysis-worker.js', 'utf8'), workerContext);
  vm.runInContext('audioSamples = Float32Array.from({length:30},()=>.8); audioSampleRate=10; stemOverlay={start:1,end:2,sampleRate:10,samples:Float32Array.from({length:10},()=>.25)}',workerContext);
  assert.equal(workerContext.sampleAt(5), 0); assert.equal(workerContext.sampleAt(15), .25); assert.equal(workerContext.sampleAt(25), 0);
  console.log('Stem overlap-add, six-source order, mute mixing, quiet detection, WAV encoding, and analysis time offsets passed.');
})().catch(error => {console.error(error);process.exitCode=1;});

// A media-source swap must retain original-track coordinates and reject stale
// metadata events when users toggle several stems quickly or open another file.
const media = new EventTarget();
Object.assign(media, {currentTime:12,duration:30,paused:false,playbackRate:.5,preservesPitch:true});
media.pause = () => { media.paused = true; };
media.play = async () => { media.paused = false; };
media.load = () => {};
const transportContext = vm.createContext({
  document:{currentScript:{src:'https://example.test/assets/js/transcribe-stems.js'}},
  TranscribeStemAudio:core,URL:{createObjectURL:()=> 'blob:mix',revokeObjectURL(){}},console
});
vm.runInContext(fs.readFileSync('assets/js/transcribe-stems.js','utf8'),transportContext);
const transport = new transportContext.TranscribeStems.Transport(media,()=> 'blob:original',()=>{});
transport.switchSource({}, {start:10,end:14});
assert.equal(transport.currentTime,12); transport.currentTime=13;
media.duration=4; media.dispatchEvent(new Event('loadedmetadata'));
assert.equal(media.currentTime,3);assert.equal(transport.currentTime,13);assert.equal(media.playbackRate,.5);assert.equal(media.paused,false);
transport.currentTime=99;assert.equal(transport.currentTime,14);
transport.switchSource(null,null);media.duration=30;media.dispatchEvent(new Event('loadedmetadata'));
assert.equal(media.currentTime,14);assert.equal(media.src,'blob:original');
transport.switchSource({}, {start:10,end:14});transport.reset();media.currentTime=0;media.dispatchEvent(new Event('loadedmetadata'));
assert.equal(media.currentTime,0);assert.equal(transport.range,null);
console.log('Segment transport offsets, original restoration, rate preservation, and stale metadata cancellation passed.');
