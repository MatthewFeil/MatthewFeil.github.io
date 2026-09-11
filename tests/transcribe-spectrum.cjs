// Run with node tests/transcribe-spectrum.cjs; exercises the production FFT and detector.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/transcribe.js'), 'utf8');
const detector = vm.createContext({
  minimumSpectrumMidi: 24, maximumSpectrumMidi: 96,
  elements: { noteTolerance: { value: '0.45' } },
  midiToFrequency: (midi) => 440 * 2 ** ((midi - 69) / 12)
});
vm.runInContext(source.slice(source.indexOf('  function detectLikelyNotes('), source.indexOf('  function drawSpectrogram()')), detector);
const worker = vm.createContext({ self: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/transcribe-analysis-worker.js'), 'utf8'), worker);
function analyze(notes, rate = 44100, noise = 0, chord = false) {
  const samples = new Float32Array(rate);
  let seed = 7;
  for (let i = 0; i < rate; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = noise * (seed / 2147483648 - 1);
    for (const [midi, amplitudes] of notes) {
      amplitudes.forEach((amplitude, h) => {
        samples[i] += amplitude * Math.sin(2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) * (h + 1) * i / rate);
      });
    }
  }
  worker.samples = samples;
  worker.rate = rate;
  vm.runInContext('audioSamples = samples; audioSampleRate = rate; activeAnalysisId = 1;', worker);
  const result = vm.runInContext('buildSpectrogram(0.3, 0.7, 1, 1)', worker);
  assert.equal(result.data.BYTES_PER_ELEMENT, 4);
  assert.ok(Array.from(result.data).every(Number.isFinite));
  if (chord) return detector.detectLikelyNotes(result.data, 16, 24, true);
  return Array.from(detector.detectLikelyNotes(result.data, 16, 24), (note) => note.midi).sort((a, b) => a - b);
}
const cases = [
  ['silence', [], []],
  ['pure A4', [[69, [0.2]]], [69]],
  ['strong harmonics', [[57, [0.04, 0.2, 0.14, 0.08, 0.04]]], [57]],
  ['missing fundamental', [[57, [0, 0.2, 0.15, 0.1, 0.05]]], [57]],
  ['major chord', [[60, [0.1, 0.05, 0.03]], [64, [0.1, 0.05, 0.03]], [67, [0.1, 0.05, 0.03]]], [60, 64, 67]],
  ['adjacent notes', [[69, [0.15]], [70, [0.15]]], [69, 70]],
  ['supported octave', [[45, [0.2]], [57, [0.12, 0, 0.08, 0, 0.06]]], [45, 57]]
];
for (const rate of [44100, 48000]) {
  for (const [name, notes, expected] of cases) {
    assert.deepEqual(analyze(notes, rate), expected, `${name} at ${rate}`);
  }
  assert.deepEqual(analyze([], rate, 0.00001), [], 'quiet noise');
}
console.log('Spectrum regression cases passed at 44.1 and 48 kHz.');

require('../assets/js/transcribe-chords.js');
for (const rate of [44100, 48000]) {
  for (const [notes, expected] of [[[48,64,67,71], 'Cmaj7'], [[48,64,70,73], 'C7♭9']]) {
    const evidence = analyze(notes.map(midi => [midi, [.1,.045,.02]]), rate, 0, true);
    assert.equal(TranscribeChords.rank(evidence)[0].label, expected, `FFT chord at ${rate}`);
  }
  assert.equal(TranscribeChords.rank(analyze([[57,[.04,.2,.14,.08,.04]]],rate,0,true)).length,0);
}
console.log('Chord scoring through production FFT and harmonic suppression passed.');
