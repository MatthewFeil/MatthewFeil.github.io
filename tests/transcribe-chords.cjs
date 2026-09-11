const assert = require('node:assert/strict');
require('../assets/js/transcribe-chords.js');
const {rank,Tracker} = TranscribeChords;
const evidence = notes => notes.map(midi=>({midi,score:1,fundamental:true}));
for(const [notes,label] of [
 [[48,64,67,71],'Cmaj7'], [[48,64,67,69],'C6'], [[45,60,64,67],'Am7'],
 [[52,60,67,71],'Cmaj7/E'], [[48,63,66,70],'Cø7'],
 [[48,64,70,73],'C7♭9'], [[48,64,70,75],'C7♯9'],
 [[43,59,65,68,76],'G13♭9'], [[48,63,70,74,77],'Cm11']
]) assert.equal(rank(evidence(notes))[0].label,label);
assert.ok(rank(evidence([48,64,67,69])).slice(0,3).some(r=>r.label==='Am7/C'));
assert.ok(rank(evidence([59,65,69,76])).some(r=>r.label.startsWith('G13/')));
assert.equal(rank([]).length,0);
assert.equal(rank(evidence([48,60,72])).length,0);
assert.equal(rank(evidence([48,55])).length,0);
const tracker=new Tracker();
assert.equal(tracker.update(evidence([48,64,67,71]),0,false)[0],'Cmaj7');
assert.equal(tracker.update(evidence([45,60,64,67]),.1,true)[0],'Am7');
assert.equal(tracker.update([], .2,true).length,0);
assert.equal(tracker.update(evidence([48,64,70,73]),5,false)[0],'C7♭9');
console.log('Chord vocabulary, bass/inversions, rootless alternatives, ambiguity, silence, and transition checks passed.');
