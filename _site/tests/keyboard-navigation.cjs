const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/keyboard-navigation.js', 'utf8');
function start(saved, unavailable = false) {
  const handlers = {};
  const root = {dataset: {}};
  const store = new Map(saved ? [['site-keyboard-navigation', saved]] : []);
  vm.runInNewContext(source, {
    document: {documentElement: root, addEventListener(type, handler, options) {handlers[type] = {handler, options};}},
    window: {addEventListener(type, handler) {handlers[type] = {handler};}},
    localStorage: {
      getItem(key) {if (unavailable) throw Error('blocked'); return store.get(key);},
      setItem(key, value) {if (unavailable) throw Error('blocked'); store.set(key, value);}
    }
  });
  function key(overrides = {}) {
    const event = {key: '', code: '', preventDefault() {this.prevented = true;}, stopImmediatePropagation() {this.stopped = true;}, ...overrides};
    handlers.keydown.handler(event);
    return event;
  }
  return {root, store, handlers, key};
}
const app = start();
assert.equal(app.root.dataset.keyboardNavigation, 'off');
assert.equal(app.handlers.keydown.options, true, 'Default mode must intercept Tab before app focus traps');
for (const shiftKey of [false, true]) {
  const event = app.key({key: 'Tab', shiftKey});
  assert(event.prevented && event.stopped, 'Default Tab and Shift+Tab must not navigate');
}
for (const key of ['c', '?', 'f', 'ArrowLeft', 'a', 'Escape']) assert(!app.key({key}).prevented, 'Shortcuts and editing must remain available');
const toggle = {altKey: true, shiftKey: true, code: 'KeyK'};
assert(app.key(toggle).prevented);
assert.equal(app.root.dataset.keyboardNavigation, 'on');
assert.equal(app.store.get('site-keyboard-navigation'), 'on');
assert(!app.key({key: 'Tab'}).prevented, 'Opt-in mode must restore native Tab navigation');
assert.equal(start(app.store.get('site-keyboard-navigation')).root.dataset.keyboardNavigation, 'on');
app.key({...toggle, repeat: true});
assert.equal(app.root.dataset.keyboardNavigation, 'on', 'Holding shortcut must not flip repeatedly');
app.key(toggle);
assert.equal(app.root.dataset.keyboardNavigation, 'off');
app.handlers.storage.handler({key: 'site-keyboard-navigation', newValue: 'on'});
assert.equal(app.root.dataset.keyboardNavigation, 'on', 'Preference must follow changes in another page');
const blocked = start(null, true);
blocked.key(toggle);
assert.equal(blocked.root.dataset.keyboardNavigation, 'on', 'Storage restrictions must not prevent opting in');
console.log('Default Tab blocking, opt-in navigation, preserved shortcuts, persistence, cross-page changes, key repeat and unavailable storage passed.');
