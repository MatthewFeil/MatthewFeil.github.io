const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/transcribe.js', 'utf8');
const listeners = new Map(), classes = new Set(), attributes = new Map();
let canceled = 0, scheduled = 0;
const audio = {
  paused: true, ended: false, error: null,
  pause() { this.paused = true; }, // No event: source replacement may discard it.
  addEventListener(type, listener) { listeners.set(type, listener); }
};
const play = {
  classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } },
  setAttribute(name, value) { attributes.set(name, value); }, dataset: {}
};
const context = vm.createContext({
  elements: { audio, play }, state: { animationFrame: 7, smoothRevision: 0 },
  syncSmoothPlayback() {}, cancelAnimationFrame() { canceled++; },
  requestAnimationFrame() { scheduled++; return 8; }, updatePlaybackFrame() {},
  renderAll() {}, requestSpectrumAt() {}, updateTimecode() {},
  selectionPlayback: () => false, transport: { currentTime: 0, reset() {} },
  stopSelectionScroll() {}, clearWaveformHoverGuide() {}, stems: null,
  worker: { postMessage() {} }, marks: { generation: 0, reset() { this.generation++; } },
  configActions: { querySelectorAll: () => [] }, showConfigStatus() {}, sessionRevision: 0
});
const playbackStart = source.indexOf('  function syncPlaybackButton()');
vm.runInContext(source.slice(playbackStart, source.indexOf("  elements.audio.addEventListener('seeked'", playbackStart)), context);
function expectButton(playing) {
  assert.equal(classes.has('is-playing'), playing);
  assert.equal(attributes.get('aria-label'), playing ? 'Pause' : 'Play');
  assert.equal(play.dataset.tooltip, playing ? 'Pause' : 'Play');
}
audio.paused = false;
listeners.get('play')(); expectButton(true);
assert.equal(scheduled, 1);

// Execute the real upload reset through pause, before assigning the next src.
const loadStart = source.indexOf('  async function loadFile(');
const srcStart = source.indexOf('    state.fileUrl = URL.createObjectURL(file);', loadStart);
vm.runInContext(source.slice(loadStart, srcStart) + '\n  }', context);
(async () => {
  await context.loadFile({ name: 'replacement.mp3' });
  expectButton(false);
  assert.ok(canceled > 0, 'Upload cancels the old playback animation without a pause event');
  listeners.get('play')(); expectButton(false);
  assert.equal(scheduled, 1, 'A stale play event cannot restart the animation');
  audio.paused = false;
  listeners.get('play')(); expectButton(true);
  listeners.get('pause')(); expectButton(true); // A queued pause for an older source.
  audio.paused = true;
  listeners.get('pause')(); expectButton(false);
  audio.paused = false;
  listeners.get('play')();
  audio.ended = true;
  listeners.get('ended')(); expectButton(false);
  audio.ended = false;
  listeners.get('play')();
  audio.error = { code: 3 };
  listeners.get('error')(); expectButton(false);
  audio.error = null; audio.paused = true;
  listeners.get('emptied')(); expectButton(false);
  console.log('Playback button upload reset, stale events, pause, end, and error regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
