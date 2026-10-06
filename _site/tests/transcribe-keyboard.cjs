const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/transcribe.js', 'utf8');
const oscillators = [];
let resume;
const context = {
  state: 'running', currentTime: 0, destination: {},
  resume: () => new Promise(resolve => { resume = resolve; }),
  createOscillator() {
    const oscillator = {frequency: {setValueAtTime(value) { oscillator.frequencyValue = value; }},
      connect() {}, disconnect() { this.disconnected = true; }, start() {},
      stop(time) { this.stopTime = time; this.onended(); }};
    oscillators.push(oscillator); return oscillator;
  },
  createGain() { return {gain: {setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}}, connect() {}, disconnect() {}}; }
};
const ctx = vm.createContext({window: {AudioContext: function() { return context; }}});
vm.runInContext(source.slice(source.indexOf('  let keyboardAudioContext'), source.indexOf('  function configureCanvas')), ctx);
(async () => {
  await ctx.playKeyboardNote(69, 1);
  assert.equal(oscillators[0].frequencyValue, 440);
  assert.equal(oscillators[0].stopTime, undefined, 'Held note must not auto-stop');
  context.currentTime = 10;
  await ctx.playKeyboardNote(72, 2);
  ctx.stopKeyboardNote(1);
  assert.equal(oscillators[0].stopTime, 10.07);
  assert(oscillators[0].disconnected);
  assert.equal(oscillators[1].stopTime, undefined, 'Releasing one finger preserves the other');
  ctx.stopKeyboardNotes();
  assert.equal(oscillators[1].stopTime, 10.07);
  context.state = 'suspended';
  const pending = ctx.playKeyboardNote(69, 3);
  ctx.stopKeyboardNote(3);
  resume(); await pending;
  assert.equal(oscillators.length, 2, 'Release before audio resumes must not leave a stuck note');
  console.log('Sustain, release, independent pointers, focus-loss cleanup, and delayed audio resume passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
