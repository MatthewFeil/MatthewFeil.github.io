const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('transcribe.html', 'utf8');
const source = fs.readFileSync('assets/js/transcribe.js', 'utf8');
const fields = ['channel','highpass','lowpass','noteTolerance','spectrumScale','semitones','cents','volume'];
const elements = {};
for (const key of fields) {
  const id = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
  const select = html.match(new RegExp(`<select id="transcribe-${id}">([\\s\\S]*?)</select>`));
  if (select) {
    const options = [...select[1].matchAll(/value="([^"]+)"/g)].map(m => ({value:m[1]}));
    elements[key] = {tagName:'SELECT',options,value:options.at(-1).value};
  } else {
    const input = html.match(new RegExp(`<input id="transcribe-${id}"[^>]+>`))[0];
    elements[key] = {tagName:'INPUT'};
    for (const attr of ['min','max','step','value']) elements[key][attr] = input.match(new RegExp(`${attr}="([^"]+)"`))[1];
  }
}
const annotations = {version:1,identity:'abc',numbering:'continuous',markers:[{id:'a',time:1,section:true},{id:'b',time:3,section:false}]};
Object.assign(elements,{audio:{playbackRate:.73,preservesPitch:false,currentTime:4},fileName:{textContent:'track.mp3'}});
const state = {duration:20,zoom:8,viewStart:2,loopStart:1,loopEnd:5,loopEnabled:true,selectionOnly:true,spectrumScrollProgress:.7};
const ctx = vm.createContext({structuredClone,elements,state,transport:elements.audio,stems:null,configFields:fields,marks:{identity:'abc',document:()=>structuredClone(annotations)},app:{dataset:{viewMode:'analysis'}},controlsPanel:{hidden:false}});
vm.runInContext(fs.readFileSync('assets/js/transcribe-marks.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('assets/js/transcribe-stems-core.js','utf8'),ctx);
vm.runInContext(source.slice(source.indexOf('  function captureConfig()'),source.indexOf('  function applyConfig(')),ctx);
const config = ctx.captureConfig();
assert.equal(Object.hasOwn(config.settings, 'position'), false);
const beforePlayback = JSON.stringify(config);
elements.audio.currentTime = 10;
assert.equal(JSON.stringify(ctx.captureConfig()), beforePlayback, 'Playback progress must not change the saved config');
const legacyConfig = JSON.parse(beforePlayback);
legacyConfig.settings.position = 4;
assert.doesNotThrow(() => ctx.validateConfig(legacyConfig), 'Older configs with a position remain importable');
const result = ctx.validateConfig(JSON.parse(JSON.stringify(config)));
assert.equal(result.annotations.markers.length,2);
assert.equal(result.settings.speed,.73);
assert.equal(result.settings.pitchLock,false);
assert.equal(result.settings.loopEnd,5);
assert.deepEqual(Object.keys(config).sort(),['annotations','audio','format','settings','version']);
assert.deepEqual(Object.keys(config.audio).sort(),['identity','name']);
for (const mutate of [c=>c.version=2,c=>c.audio.identity='other',c=>c.annotations.markers[0].time=30,c=>c.settings.speed=3,c=>c.settings.volume='NaN',c=>c.settings.channel='invalid',c=>c.settings.loopEnd=0,c=>c.settings.pitchLock='true',c=>delete c.settings.zoom]) {
  const bad=JSON.parse(JSON.stringify(config)); mutate(bad); assert.throws(()=>ctx.validateConfig(bad));
}
assert.equal(state.zoom,8);
assert.equal(elements.audio.playbackRate,.73);
console.log('Config JSON round trip, settings coverage, audio exclusion, and invalid/mismatched config rejection passed.');
const wholeAudio = JSON.parse(JSON.stringify(config));
wholeAudio.settings.loopStart = null;
wholeAudio.settings.loopEnd = null;
wholeAudio.settings.loopEnabled = true;
assert.doesNotThrow(() => ctx.validateConfig(wholeAudio));
elements.loopBottom = {classList:{toggle(){}},setAttribute(){}};
elements.selectionOnly = {classList:{toggle(){}},setAttribute(){}};
elements.start = {setAttribute(){}};
vm.runInContext(source.slice(source.indexOf('  function hasSelection()'),source.indexOf('  async function togglePlayback()')),ctx);
Object.assign(state,{loopStart:null,loopEnd:null,loopEnabled:false});
ctx.updateLoopControls();
assert.equal(elements.audio.loop,false);
assert.equal(elements.loopBottom.disabled,false);
ctx.toggleLoop(); assert.equal(elements.audio.loop,true); assert.equal(state.loopEnabled,true);
ctx.toggleLoop(); assert.equal(elements.audio.loop,false);
Object.assign(state,{loopStart:1,loopEnd:5,selectionOnly:true});
ctx.setLoopEnabled(true); assert.equal(state.loopEnabled,true); assert.equal(elements.audio.loop,false);
console.log('Whole-audio loop toggle, default off, segment loop isolation, and config validation passed.');

state.selectionOnly = false;
ctx.updateLoopControls();
assert.equal(elements.audio.loop,true, 'Whole track repeats even with a highlight');
assert.equal(elements.start.title,'Return to track start (B)');
state.selectionOnly = true;
ctx.updateLoopControls();
assert.equal(elements.audio.loop,false);
assert.equal(elements.start.title,'Return to selection start (B)');
elements.audio.paused = false;
elements.audio.pause = () => { elements.audio.paused = true; };
elements.audio.currentTime = 5.1;
ctx.enforcePlaybackRange(); assert.equal(elements.audio.currentTime,1);
ctx.setLoopEnabled(false);
elements.audio.currentTime = 5.1;
ctx.enforcePlaybackRange(); assert.equal(elements.audio.currentTime,5); assert.equal(elements.audio.paused,true);
elements.audio.paused = false; state.selectionOnly = false; elements.audio.currentTime = 6;
ctx.enforcePlaybackRange(); assert.equal(elements.audio.currentTime,6); assert.equal(elements.audio.paused,false);
Object.assign(ctx,{normalizeViewStart(){},renderAll(){},requestSpectrumAt(){}});
ctx.returnToStart(); assert.equal(elements.audio.currentTime,0);
state.selectionOnly = true; ctx.returnToStart(); assert.equal(elements.audio.currentTime,1);
const badScope = JSON.parse(JSON.stringify(config)); badScope.settings.selectionOnly = 'true';
assert.throws(() => ctx.validateConfig(badScope));
const oldScope = JSON.parse(JSON.stringify(config)); delete oldScope.settings.selectionOnly;
assert.doesNotThrow(() => ctx.validateConfig(oldScope));
console.log('Independent playback scope, segment repeat and stop, contextual restart, and legacy configs passed.');

const stemConfig = JSON.parse(JSON.stringify(config));
stemConfig.settings.stems = {enabled:true,stems:{drums:true,bass:true,other:false,vocals:false,guitar:true,piano:true}};
assert.doesNotThrow(() => ctx.validateConfig(stemConfig));
stemConfig.settings.stems.stems.piano = 'yes';
assert.throws(() => ctx.validateConfig(stemConfig));
console.log('Stem preferences validate without adding any audio to configs.');
