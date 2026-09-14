const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/transcribe.js','utf8');
const state = {duration:100,dragOriginX:20,dragging:'pending',dragMoved:false,loopStart:null,loopEnd:null};
const transport = {currentTime:9};
const ctx = vm.createContext({
  formatTime:String,
  state,transport,marks:{rangeAnchor:null},stems:null,
  elements:{waveform:{getBoundingClientRect:()=>({left:0,width:100})},selectionStatus:{}},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),xToTime:x=>x/10,
  cancelAnimationFrame(){},drawWaveform(){},drawOverview(){},updateLoopControls(){},renderAll(){},requestSpectrumAt(){},setLoopEnabled(value){state.loopEnabled=value;}
});
vm.runInContext(source.slice(source.indexOf('  function setSelection('),source.indexOf('  const configActions')),ctx);
vm.runInContext(source.slice(source.indexOf('  function waveformPointerPosition('),source.indexOf('  function updateOverviewDrag(')),ctx);
function reset(origin) {Object.assign(state,{dragOriginX:origin,dragging:'pending',dragMoved:false,loopStart:null,loopEnd:null});transport.currentTime=9;}
for(const [from,to] of [[20,80],[80,20]]) {
  reset(from);
  // Browsers may coalesce all movement before the release.
  ctx.handleWaveformPointerUp({clientX:to,type:'pointerup'});
  assert.equal(state.loopStart,2);assert.equal(state.loopEnd,8);
  assert.equal(transport.currentTime,2);assert.equal(state.selectionOnly,true);
}
reset(20);ctx.handleWaveformPointerMove({clientX:45});ctx.handleWaveformPointerUp({clientX:80,type:'pointerup'});
assert.equal(state.loopEnd,8,'Release wins over a stale final pointermove');
assert.equal(transport.currentTime,2);
reset(20);ctx.handleWaveformPointerUp({clientX:21,type:'pointerup'});
assert.equal(state.loopStart,null,'A click remains a seek, not a selection');assert.equal(transport.currentTime,2.1);
console.log('Fast drags in both directions, coalesced movement, final release position, playhead reset, and click seeking passed.');

// Exercise the actual canvas renderer before release, including crossing the anchor.
const outlines = [], handles = [];
const canvas = new Proxy({}, {get: (_, key) => {
  if (key === 'strokeRect') return (...args) => outlines.push(args);
  if (key === 'fillRect') return (...args) => { if (args[2] === 8) handles.push(args); };
  return () => {};
}, set: () => true});
Object.assign(ctx, {
  configureCanvas: () => ({context:canvas,width:100,height:200}),
  colors:{}, viewDuration: () => 10, timeToX: time => time * 10,
  drawPeakRange() {}
});
ctx.marks.draw = () => {};
state.peaks = new Float32Array(20); state.viewStart = 0;
vm.runInContext(source.slice(source.indexOf('  function drawWaveform()'),source.indexOf('  function drawKeyboard(')),ctx);
for (const [anchor, pointer] of [[80,20],[20,80],[80,90],[80,30]]) {
  reset(anchor); outlines.length = 0; handles.length = 0;
  ctx.handleWaveformPointerMove({clientX:pointer});
  const left = Math.min(anchor,pointer), right = Math.max(anchor,pointer);
  assert.deepEqual(outlines.at(-1),[left+.5,30.5,right-left-1,169], 'Live outline spans both endpoints');
  assert.deepEqual(handles.slice(-2).map(rect => rect[0]),[left-4,right-4], 'Both endpoint handles remain visible');
}
console.log('Live forward and reverse selection outlines and both endpoint handles passed.');
