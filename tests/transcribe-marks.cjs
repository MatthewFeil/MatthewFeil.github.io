const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ctx = vm.createContext({ structuredClone, crypto: require('node:crypto').webcrypto });
vm.runInContext(fs.readFileSync('assets/js/transcribe-marks.js','utf8'),ctx);
const { Marks, rows, validate } = ctx.TranscribeMarks;
const doc = { numbering:'section', markers:[{id:'c',time:8,section:true},{id:'a',time:0,section:true},{id:'b',time:4,section:false},{id:'d',time:12,section:false}] };
const labels = d => Array.from(rows(d),m=>m.label);
assert.deepEqual(labels(doc),['A1','A2','B1','B2']);
assert.deepEqual(labels({...doc,numbering:'continuous'}),['A1','A2','B3','B4']);
assert.equal(rows({numbering:'section',markers:Array.from({length:28},(_,i)=>({id:String(i),time:i,section:true}))})[27].label,'AB1');
let now=1, loop;
const model = Object.create(Marks.prototype);
Object.assign(model,{doc:{markers:[],numbering:'section'},ready:true,undoStack:[],redoStack:[],host:{current:()=>now,duration:()=>20,seek:t=>now=t,loop:(a,b)=>loop=[a,b]},refresh(){},save(){},say(){}});
model.mark(false); assert.equal(model.doc.markers[0].section,true);
now=1.04; model.mark(true); assert.equal(model.doc.markers.length,1);
now=5; model.mark(false); now=9; model.mark(true); now=13; model.mark(false);
assert.deepEqual(labels(model.doc),['A1','A2','B1','B2']);
now=6; model.loop(false); assert.deepEqual(loop,[5,9]);
model.loop(true); assert.deepEqual(loop,[1,9]);
now=14; model.loop(true); assert.deepEqual(loop,[9,20]);
model.navigate(-1); assert.equal(now,13); model.navigate(-1,true); assert.equal(now,9);
model.remove(); assert.equal(model.doc.markers.length,3); model.history(false); assert.equal(model.doc.markers.length,4); model.history(true); assert.equal(model.doc.markers.length,3);
const event = {key:'m',preventDefault(){},repeat:true}; const count=model.doc.markers.length; now=17;model.key(event);assert.equal(model.doc.markers.length,count);
model.key({...event,repeat:false});assert.equal(model.doc.markers.length,count+1);
assert.throws(()=>validate({version:1,identity:'wrong',...doc},'file',20));
assert.throws(()=>validate({version:1,identity:'file',...doc,markers:[{id:'x',time:99,section:false}]},'file',20));
assert.throws(()=>validate({version:1,identity:'file',...doc,markers:[{id:'x',time:1,section:false},{id:'y',time:1,section:false}]},'file',20));
assert.deepEqual(labels(validate({version:1,identity:'file',...doc},'file',20)),['A1','A2','B1','B2']);
console.log('Marker numbering, capture, history, navigation, loops, and validation passed.');
model.doc = structuredClone(doc);
model.loopStartInput = {value:'a2'}; model.loopEndInput = {value:'B1'};
model.loopInputs(); assert.deepEqual(loop,[4,12]);
model.loopStartInput.value='b'; model.loopEndInput.value=''; model.loopInputs(); assert.deepEqual(loop,[8,20]);
assert.equal(model.loopEndInput.value,'B2');
model.loopStartInput.value='2'; model.loopEndInput.value='2';
model.loopInputs(); assert.deepEqual(loop,[12,20], 'Bare numbers use the current section');
let preview; model.host.preview = (a,b) => preview = [a,b];
model.rangePoint(2); model.previewRange(8); assert.deepEqual(preview,[2,8]);
assert.equal(model.rangeAnchor.time,2);
model.rangePoint(8,'c'); assert.deepEqual(loop,[2,8]);
model.previewRange(10); assert.deepEqual(preview,[2,8], 'Completed range must stop following the pointer');
model.rangePoint(15); model.previewRange(4); assert.deepEqual(preview,[15,4]); model.rangePoint(4,'b'); assert.deepEqual(loop,[4,15]);
model.rangePoint(4,'b'); model.rangePoint(12,'d'); assert.deepEqual(loop,[4,12]);
model.doc.numbering='continuous'; model.loopStartInput.value='2'; model.loopEndInput.value='3';
model.loopInputs(); assert.deepEqual(loop,[4,12]);
console.log('Inclusive measure inputs, whole sections, ambiguous numbers, mixed and reverse Shift ranges passed.');
model.doc = structuredClone(doc); now = 9;
assert.equal(model.goTo('2'), true); assert.equal(now, 12, 'Bare numbers use current section');
assert.equal(model.goTo('A2'), true); assert.equal(now, 4);
assert.equal(model.goTo('B'), true); assert.equal(now, 8);
assert.equal(model.goTo('99'), false); assert.equal(now, 8);
model.doc.numbering = 'continuous';
assert.equal(model.goTo('2'), true); assert.equal(now, 4);
let selectedRange;
model.host.selectRange = (a,b) => selectedRange = [a,b];
model.loopStartInput.value = 'A2'; model.loopEndInput.value = 'B3';
model.loopInputs(false); assert.deepEqual(selectedRange, [4,12]);
let opened = false; model.openMeasures = go => opened = go;
model.key({key:'g', preventDefault(){}}); assert.equal(opened, true);
console.log('Go shortcut, section-aware navigation, invalid destinations, and selection without repeat passed.');

model.doc = structuredClone(doc); now = 9;
for (const value of ['b2', ' B 02 ', 'section b', 'm. 2', 'measure 02', 'b:2']) {
  assert.equal(model.goTo(value), true, value);
  assert.equal(now, value === 'section b' ? 8 : 12, value);
}
for (const [start, end, expected] of [
  ['a', 'b', [0,20]], ['a2', 'b', [4,20]], ['b', '', [8,20]],
  ['1', '2', [8,20]], ['a1', '2', [0,8]], ['B 02', '', [12,20]],
  ['b2', 'a1', [0,20]]
]) {
  model.loopStartInput.value = start; model.loopEndInput.value = end;
  assert.equal(model.loopInputs(), true); assert.deepEqual(loop, expected);
}
const previousLoop = loop;
model.loopStartInput.value = 'z99'; assert.equal(model.loopInputs(), undefined);
assert.equal(loop, previousLoop);
console.log('Flexible lowercase, spaced, prefixed, numeric, section, mixed, blank-end, and reversed range inputs passed.');

// Deletion follows addition order even when markers were placed out of time order.
model.doc = structuredClone(doc);
model.selected = 'b';
model.remove();
assert.equal(model.selected, 'a', 'Select the marker added before the deleted marker');
model.remove();
assert.equal(model.selected, 'c');
model.remove();
assert.equal(model.selected, 'd', 'Deleting the first-added marker selects the next remaining one');
model.remove();
assert.equal(model.selected, null, 'Deleting the final marker clears selection');
assert.equal(model.doc.markers.length, 0);
const historyCount = model.undoStack.length;
model.remove();
assert.equal(model.undoStack.length, historyCount, 'No selection leaves history unchanged');
console.log('Deletion selection follows addition order with next-marker and empty-list fallbacks.');
