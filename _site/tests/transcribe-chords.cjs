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
// Weak color tones must not turn common qualities into extended/slash guesses.
for (const [base, colors, quality] of [
 [[48,64,67], [74], ''], [[48,63,67], [74], 'm'],
 [[48,64,67,70], [74,77,81], '7'],
 [[48,64,67,71], [74,78,81], 'maj7']
]) {
 for (let root = 0; root < 12; root++) for (const strength of [.13,.25,.4]) {
  const notes = evidence(base.map(midi => midi + root)).concat(
   colors.map(midi => ({midi:midi + root,score:strength,fundamental:true})));
  const expected = rank(evidence(base.map(midi => midi + root)))[0].label;
  assert.equal(rank(notes)[0].label,expected,`${quality || 'major'} with weak color tones, root ${root}, strength ${strength}`);
  // Relative support, rather than absolute loudness, controls the preference.
  assert.equal(rank(notes.map(n => ({...n,score:n.score * .02})))[0].label,expected);
 }
}
for (const [notes,label] of [
 [[48,64,67,74],'Cadd9'], [[48,63,67,74],'Cm(add9)'],
 [[48,64,67,70,74],'C9'], [[48,63,67,70,74,77],'Cm11'],
 [[48,64,67,71,74,78,81],'Cmaj13♯11']
]) assert.equal(rank(evidence(notes))[0].label,label,'Clear extensions remain eligible to win');
console.log('Simple-quality preference with weak extensions across all roots and volumes, and clear extended voicings passed.');
const tracker=new Tracker();
assert.equal(tracker.update(evidence([48,64,67,71]),0,false)[0],'Cmaj7');
assert.equal(tracker.update(evidence([45,60,64,67]),.1,true)[0],'Cmaj7');
assert.equal(tracker.update(evidence([45,60,64,67]),.31,true)[0],'Am7');
assert.equal(tracker.update([], .32,true)[0],'Am7');
assert.equal(tracker.update([], .45,true).length,0);
assert.equal(tracker.update(evidence([48,64,70,73]),5,false)[0],'C7♭9');
console.log('Chord vocabulary, bass/inversions, rootless alternatives, ambiguity, silence, and transition checks passed.');
// A higher observation cadence must preserve the same smoothing over audio time.
const once=new Tracker(), frequent=new Tracker();
const first=evidence([48,64,67,71]), changed=first.map(n=>({...n,score:.4}));
once.update(first,0,false);frequent.update(first,0,false);
once.update(changed,.1,true);
for(let i=1;i<=3;i++)frequent.update(changed,i*.1/3,true);
for(let i=0;i<first.length;i++)assert(Math.abs(once.notes[i].score-frequent.notes[i].score)<1e-12);
console.log('Chord smoothing is invariant over elapsed audio time at 10 and 30 updates/sec.');

// Readout stability uses wall time at every speed, even with irregular results.
for (const speed of [.25,.5,1,2]) {
 const tr = new Tracker();
 assert.deepEqual(tr.update(first,0,true,0),[]);
 assert.deepEqual(tr.update(first,.19*speed,true,190),[]);
 assert.equal(tr.update(first,.201*speed,true,201)[0],'Cmaj7');
 const next = evidence([45,60,64,67]);
 assert.equal(tr.update(next,.25*speed,true,250)[0],'Cmaj7');
 assert.equal(tr.update(next,.45*speed,true,450)[0],'Cmaj7','Minimum publication interval');
 assert.equal(tr.update(next,.51*speed,true,510)[0],'Am7');
 // One brief contradictory observation must not replace a confirmed chord.
 assert.equal(tr.update(first,.55*speed,true,550)[0],'Am7');
 assert.equal(tr.update(next,.59*speed,true,590)[0],'Am7');
 assert.equal(tr.update([], .62*speed,true,620)[0],'Am7');
 assert.deepEqual(tr.update([], .741*speed,true,741),[],'Bounded silence release');
 assert.equal(tr.update(first,8,false,750)[0],'Cmaj7','Paused or aggregate result is immediate');
 assert.deepEqual(tr.update(next,1,true,800),[],'Backward seek clears history');
 assert.deepEqual(tr.update(next,1.05,true,850),[]);
 assert.equal(tr.update(next,1.21,true,1010)[0],'Am7');
}
const unstable = new Tracker();
for(let i=0;i<30;i++)assert.deepEqual(unstable.update(evidence(i%2 ? [45,60,64,67] : [48,64,67,71]),i/30,true,i*1000/30),[],'Alternating guesses need confirmation');
console.log('Chord confirmation, publication limits, transient rejection, silence, paused analysis and reset checks at all speeds passed.');
