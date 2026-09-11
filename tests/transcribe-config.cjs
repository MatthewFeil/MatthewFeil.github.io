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
const state = {duration:20,zoom:8,viewStart:2,loopStart:1,loopEnd:5,loopEnabled:true,spectrumScrollProgress:.7};
const ctx = vm.createContext({structuredClone,elements,state,configFields:fields,marks:{identity:'abc',document:()=>structuredClone(annotations)},app:{dataset:{viewMode:'analysis'}},controlsPanel:{hidden:false}});
vm.runInContext(fs.readFileSync('assets/js/transcribe-marks.js','utf8'),ctx);
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
