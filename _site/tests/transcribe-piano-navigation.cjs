const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('assets/js/transcribe.js', 'utf8');
const handlers = new Map();
const attributes = new Map();
const notes = [];
const stopped = [];
const keyboard = {
  style: {}, setAttribute: (key, value) => attributes.set(key, value),
  addEventListener: (type, handler) => handlers.set(type, handler),
  getBoundingClientRect: () => ({ width: 720 })
};
const grid = { scrollLeft: 0, clientWidth: 200, scrollWidth: 720 };
const context = vm.createContext({
  elements: { keyboard, analysisGrid: grid },
  minimumSpectrumMidi: 24, maximumSpectrumMidi: 96,
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  midiCenterToKeyboardX: midi => (midi - 24) * 10,
  drawKeyboard() {},
  playKeyboardNote: async (midi, id) => notes.push({ midi, id }),
  stopKeyboardNote: id => stopped.push(id), console
});
vm.runInContext(source.slice(source.indexOf('  let keyboardSelectedMidi'), source.indexOf("  elements.keyboard.style.touchAction = 'none'")), context);
function key(type, value, extra = {}) {
  const event = { key: value, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
  handlers.get(type)(event);
  return event;
}
handlers.get('focus')();
key('keydown', 'ArrowRight');
key('keydown', ' ');
key('keydown', ' ', { repeat: true });
assert.equal(notes.length, 1, 'Holding a key must not create repeated voices');
assert.equal(notes[0].midi, 61);
const release = key('keyup', ' ');
assert(release.prevented && release.stopped, 'Piano release must not bubble into transport shortcuts');
assert.equal(stopped.at(-1), notes[0].id);
key('keydown', 'End'); key('keydown', 'ArrowRight'); key('keydown', 'Enter');
assert.equal(notes.at(-1).midi, 95, 'Upper bound stays inside the piano');
key('keydown', 'Home'); key('keydown', 'ArrowDown'); key('keydown', 'Enter');
assert.equal(notes.at(-1).midi, 24, 'Lower bound stays inside the piano');
key('keydown', 'ArrowUp'); key('keydown', 'Enter');
assert.equal(notes.at(-1).midi, 36, 'Up moves one octave');
handlers.get('blur')();
assert.equal(stopped.at(-1), notes.at(-1).id, 'Leaving the piano releases the audition voice');
assert(grid.scrollLeft >= 0 && grid.scrollLeft <= 520, 'Selected notes stay within scroll bounds');
const modified = key('keydown', 'ArrowRight', { altKey: true });
assert(!modified.prevented, 'Modified application shortcuts remain available');
const unrelated = key('keydown', 'c');
assert(!unrelated.prevented, 'Unrelated application shortcuts remain available');
console.log('Piano navigation, bounds, octave steps, held-key deduplication, release, blur and shortcut preservation passed.');
