const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/transcribe.js', 'utf8');
const paths = [];
let path = [];
const context = { clearRect() {}, fillRect() {}, beginPath() { path = []; }, moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); }, stroke() { paths.push({ width: this.lineWidth, points: path }); } };
const state = { spectrogram: { data: new Float32Array(1152).fill(0.1), frames: 1, rows: 1152, binsPerSemitone: 16, minimumMidi: 24, maximumMidi: 96, noteTolerance: '0.45', notes: [], reference: 0.1 }, spectrumCursor: null };
const scope = vm.createContext({
  minimumSpectrumMidi: 24, maximumSpectrumMidi: 96, spectrumWhiteKeyCount: 42,
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  isBlackKey: midi => [1, 3, 6, 8, 10].includes(midi % 12),
  elements: { spectrumScale: { value: 'linear' }, noteTolerance: { value: '0.45' } }, state,
  configureCanvas: () => ({ context, width: 840, height: 200 }),
  colors: {}, drawKeyboard() {}
});
vm.runInContext(source.slice(source.indexOf('  function whiteKeysBefore('), source.indexOf('  // Match the painted key shapes')), scope);
vm.runInContext(source.slice(source.indexOf('  function drawSpectrogram()'), source.indexOf('  function renderAll()')), scope);
for (const width of [320, 840, 1440]) {
  assert.equal(scope.midiCenterToKeyboardX(23.5, width), 0);
  assert.equal(scope.midiCenterToKeyboardX(95.5, width), width);
  assert.equal(scope.keyboardXToMidi(0, width), 23.5);
  assert.equal(scope.keyboardXToMidi(width, width), 95.5);
  for (let midi = 23.5; midi <= 95.5; midi += 0.125) {
    assert(Math.abs(scope.keyboardXToMidi(scope.midiCenterToKeyboardX(midi, width), width) - midi) < 1e-8, `Round trip at ${midi}`);
  }
}
for (const scale of ['linear', 'db']) {
  scope.elements.spectrumScale.value = scale;
  paths.length = 0; scope.drawSpectrogram();
  const line = paths.find(p => p.width === 2);
  assert.equal(line.points[0][0], 0);
  assert.equal(line.points.at(-1)[0], 840);
}
for (const midi of [23.5, 95.5]) {
  state.spectrumCursor = { midi };
  paths.length = 0; scope.drawSpectrogram();
  assert.equal(paths.at(-1).points[0][0], midi === 23.5 ? 0 : 840);
}
console.log('Spectrum line endpoints, pitch coordinate round trips and cursor edges passed.');
