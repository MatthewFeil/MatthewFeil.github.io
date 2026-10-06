const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Notes = require('../assets/js/transcribe-notes.js');
for (const spelling of ['c#6', 'C#6', 'C sharp 6', 'c SHARP6', 'C♯6', 'D flat 6', 'Db6', 'D♭6']) {
  assert.equal(Notes.parseNoteName(spelling), 85, spelling);
}
assert.equal(Notes.parseNoteName(' B sharp 3 '), 60, 'Enharmonic octave boundary');
assert.equal(Notes.parseNoteName('C flat 4'), 59);
assert.equal(Notes.parseNoteName('C natural 4'), 60);
for (const invalid of ['', 'H4', 'C sharp', '60', 'C#6 extra', 'C999']) {
  assert.equal(Notes.parseNoteName(invalid), null, invalid);
}
function worker(rate, samples) {
  const ctx = vm.createContext({TranscribeNotes:Notes, importScripts(){}, self:{addEventListener(){}}});
  vm.runInContext(fs.readFileSync('assets/js/transcribe-analysis-worker.js','utf8'),ctx);
  ctx.samples = samples; ctx.rate = rate;
  vm.runInContext('audioSamples=samples;audioSampleRate=rate;activeAnalysisId=1;',ctx);
  return ctx;
}
function evidence(ctx, time, mode='melody', aggregate=false) {
  const result = ctx.buildSpectrogram(Math.max(0,time-.2),time+.2,1,1,0,aggregate);
  const recent = mode==='melody' && !aggregate ? ctx.recentSpectrum(time,0,result) : null;
  return Notes.extract(result.data,16,24,.45,recent);
}
function recording(rate, seconds, voices) {
  return Float32Array.from({length:Math.round(rate*seconds)},(_,i)=> {
    const t=i/rate;let value=0;
    for(const voice of voices) {
      const [midi,volume,start=0,end=seconds]=voice;
      if(t>=start&&t<end)for(const [h,a] of [[1,1],[2,.3],[3,.15]])value+=volume*a*Math.sin(2*Math.PI*440*2**((midi-69)/12)*h*t);
    }
    return value;
  });
}
// Configuration has detached defaults, per-mode ranges and strict validation.
const defaults=Notes.defaults();assert.equal(defaults.mode,'balanced');
assert.deepEqual(Notes.validate(undefined),defaults);
const modified=Notes.defaults();modified.ranges.melody.low=60;assert.equal(defaults.ranges.melody.low,48);
for(const mutate of [v=>v.mode='unknown',v=>v.mode=['melody'],v=>v.ranges.bass.low=96,v=>v.ranges.melody.high=47,v=>v.ranges.chordal.low=36.5]) {
 const bad=Notes.defaults();mutate(bad);assert.throws(()=>Notes.validate(bad));
}
// Production FFT and candidates, not handwritten pitch inputs.
for(const rate of [44100,48000]) {
 const chord=worker(rate,recording(rate,2,[[48,.08],[60,.075],[64,.07],[67,.06],[71,.025],[74,.018]]));
 const ev=evidence(chord,1,'chordal');
 const settings=Notes.defaults();settings.mode='chordal';
 const chordNotes=new Notes.Tracker().update(ev,settings,.45,1,0,false);
 assert(chordNotes.length>=5,`Quiet voicing tones at ${rate}: ${chordNotes.map(n=>n.midi)}`);
 assert(chordNotes.length<=12);
 settings.mode='balanced';assert(new Notes.Tracker().update(ev,settings,.45,1,0,false).length<=6);
 settings.mode='bass';const bass=new Notes.Tracker().update(ev,settings,.45,1,0,false);
 assert.equal(bass.length,1);assert.equal(bass[0].midi,48);
 const silence=worker(rate,new Float32Array(rate));assert.equal(evidence(silence,.5).candidates.length,0);
}
// A strong upper melody must not drown out a supported bass in Bass mode.
const bassMix=worker(44100,recording(44100,2,[[48,.025],[76,.12]]));
const bassSettings=Notes.defaults();bassSettings.mode='bass';
assert.equal(new Notes.Tracker().update(evidence(bassMix,1,'bass'),bassSettings,.45,1,0,false)[0].midi,48);
const outside=worker(44100,recording(44100,2,[[69,.1]]));
assert.equal(new Notes.Tracker().update(evidence(outside,1,'bass'),bassSettings,.45,1,0,false)[0].midi,69,'Preferred range is soft');
for(const amplitudes of [[.04,.2,.14,.08,.04],[0,.2,.15,.1,.05]]) {
 const samples=Float32Array.from({length:44100*2},(_,i)=>amplitudes.reduce((sum,a,h)=>sum+a*Math.sin(2*Math.PI*110*(h+1)*i/44100),0));
 const harmonic=worker(44100,samples),e=evidence(harmonic,1,'bass');
 assert.equal(new Notes.Tracker().update(e,bassSettings,.45,1,0,false)[0].midi,45,'Harmonic family remains a bass fundamental');
}
const lowBoundary=worker(44100,recording(44100,2,[[24,.1]]));
assert.equal(new Notes.Tracker().update(evidence(lowBoundary,1,'bass'),bassSettings,.45,1,0,false)[0].midi,24);
const ctx=worker(44100,recording(44100,5,[[48,.025],[52,.022],[55,.023],[76,.12,.2,1],[76,.065,1,2],[77,.12,2.6,3.5],[84,.13,3.6,4.5]]));
for(const speed of [.25,.5,1,2]) {
 const tracker=new Notes.Tracker(),settings=Notes.defaults();settings.mode='melody';
 const observations=[];
 for(let now=0;now<4500/speed;now+=1000/30) {
  const time=.2+now*speed/1000;if(time>4.8)break;
  const notes=tracker.update(evidence(ctx,time),settings,.45,time,now,true);
  assert(notes.length<=3);
  if(time>.7&&time<1.7)assert(notes.every(n=>n.midi===76),`Chord tone during melody at ${speed}: ${notes.map(n=>n.midi)}`);
  observations.push({time,notes});
 }
 for(const [start,end,midi] of [[.7,1.7,76],[2.9,3.3,77],[3.9,4.3,84]]) {
  const segment=observations.filter(o=>o.time>=start&&o.time<=end);
  assert(segment.some(o=>o.notes.some(n=>n.midi===midi&&!n.releasing)),`Melody ${midi} at speed ${speed}`);
 }
 const rest=observations.filter(o=>o.time>=2.3&&o.time<=2.5);
 assert(rest.length);assert(rest.every(o=>o.notes.length===0),`Accompaniment during rest at ${speed}: ${JSON.stringify(rest)}`);
 tracker.reset();assert.equal(tracker.active.size,0);assert.equal(tracker.background.size,0);
}
// Clock-based admission/release survives unequal delivery intervals.
const settings=Notes.defaults(),tracker=new Notes.Tracker();
const ev={peak:.1,candidates:[{midi:69,preciseMidi:69.15,score:.1,prominence:10,fundamental:true}]};
assert.equal(tracker.update(ev,settings,.45,1,0).length,0);
assert.equal(tracker.update(ev,settings,.45,1.03,40).length,0);
assert.equal(tracker.update(ev,settings,.45,1.07,85).length,1);
let n=tracker.update({peak:0,candidates:[]},settings,.45,1.1,110);assert.equal(n[0].releasing,true);
n=tracker.update({peak:0,candidates:[]},settings,.45,1.2,191);assert.equal(n.length,0);
// Static/paused and aggregate analysis admit notes immediately without contour history.
assert.equal(new Notes.Tracker().update(ev,settings,.45,1,0,false).length,1);
console.log('Four detection policies, quiet voicings, bass, silence, melody rests/re-entry/leaps at all speeds, timing and settings passed.');
// Vibrato changes cents smoothly without selecting neighboring keys.
let phase=0;const vibrato=new Float32Array(44100*2);
for(let i=0;i<vibrato.length;i++){phase+=2*Math.PI*440*2**((.2*Math.sin(2*Math.PI*5*i/44100))/12)/44100;vibrato[i]=.15*Math.sin(phase)}
const vibratoWorker=worker(44100,vibrato),vibratoTracker=new Notes.Tracker(),melody=Notes.defaults();melody.mode='melody';
for(let i=0;i<35;i++) {
 const time=.5+i/30,notes=vibratoTracker.update(evidence(vibratoWorker,time),melody,.45,time,i*1000/30);
 if(i>4){assert.equal(notes.length,1);assert.equal(notes[0].midi,69);assert(Math.abs(notes[0].preciseMidi-69)<.35)}
}
assert.equal(Notes.highlightStrength({releasing:true,releaseStrength:.8,lostAt:100},180),0,'Visual release ends at 80 ms even without another worker result');
const quantized=new Notes.Tracker();quantized.update(ev,settings,.45,1,0);quantized.update(ev,settings,.45,1,35);
assert.equal(quantized.update(ev,settings,.45,1,70).length,1,'Repeated quantized audio times must not restart admission');
const backwards=quantized.update(ev,settings,.45,.5,100);assert.equal(backwards.length,0,'A backwards loop resets history');
console.log('Vibrato, precise wall-time visual release, quantized playhead time and backwards-loop reset passed.');
// Short-window evidence follows the same stem overlay and boundary silence as the main spectrum.
const stemWorker=worker(44100,recording(44100,2,[[69,.1]]));
stemWorker.overlay={samples:recording(44100,1,[[60,.1]]),sampleRate:44100,start:.5,end:1.5};
vm.runInContext('stemOverlay=overlay;',stemWorker);
assert.equal(new Notes.Tracker().update(evidence(stemWorker,1),melody,.45,1,0,false)[0].midi,60);
assert.equal(new Notes.Tracker().update(evidence(stemWorker,1.8),melody,.45,1.8,0,false).length,0);
const aggregate=evidence(ctx,1,'melody',true);
assert.equal(aggregate.candidates.some(n=>n.recentScore!==undefined),false,'Selection averages do not use a live trailing window');
assert(new Notes.Tracker().update(aggregate,melody,.45,1,0,false).length >= 1);
console.log('Stem-overlay short evidence, range-boundary silence and static selection analysis passed.');

// Chordal ignores brief flicker during playback, but static analysis is immediate.
const chordSettings=Notes.defaults();chordSettings.mode='chordal';
const chordTracker=new Notes.Tracker();
for(const now of [0,35,75,110]) assert.equal(chordTracker.update(ev,chordSettings,.45,1+now/1000,now).length,0);
assert.equal(chordTracker.update({peak:0,candidates:[]},chordSettings,.45,1.115,115).length,0);
for(const now of [150,190,230]) assert.equal(chordTracker.update(ev,chordSettings,.45,1+now/1000,now).length,0);
assert.equal(chordTracker.update(ev,chordSettings,.45,1.28,280).length,1);
assert.equal(new Notes.Tracker().update(ev,chordSettings,.45,1,0,false).length,1);
// A supported quiet line that previously fell below the default Melody threshold.
const quiet={peak:.1,candidates:[{...ev.candidates[0],score:.017,recentScore:.017}]};
assert.equal(new Notes.Tracker().update(quiet,melody,.45,1,0,false).length,1);
// Two melodic instruments over continuing chords, including a shared rest and re-entry.
const duet=worker(44100,recording(44100,4,[[48,.018],[52,.016],[55,.017],[76,.12,.2,1.5],[71,.10,.2,1.5],[77,.12,2.4,3.5],[72,.10,2.4,3.5]]));
for(const speed of [.25,.5,1,2]) {
 const tracker=new Notes.Tracker();let first=false,second=false,rest=0;
 for(let now=0;now<3800/speed;now+=1000/30) {
  const time=.2+now*speed/1000;if(time>3.8)break;
  const notes=tracker.update(evidence(duet,time),melody,.45,time,now);
  const pitches=notes.filter(n=>!n.releasing).map(n=>n.midi);
  if(time>.6&&time<1.3){
   assert(pitches.every(midi=>[76,71].includes(midi)),`Chord tone during duet: ${pitches}`);
   if(pitches.includes(76)&&pitches.includes(71))first=true;
  }
  if(time>2.8&&time<3.3&&pitches.includes(77)&&pitches.includes(72))second=true;
  if(time>1.85&&time<2.25){rest++;assert.equal(notes.length,0,`Duet rest at ${speed}, ${time}: ${pitches}`);}
 }
 assert(first&&second&&rest,`Both melodic lines at speed ${speed}`);
}
console.log('Chordal playback confirmation, quieter Melody admission and melodic duet rests at all speeds passed.');

const competingBass={peak:.1,candidates:[{...ev.candidates[0],midi:48,preciseMidi:48,score:.1},{...ev.candidates[0],midi:52,preciseMidi:52,score:.24}]};
assert.equal(new Notes.Tracker().update(competingBass,bassSettings,.45,1,0,false)[0].midi,48,'A borderline stronger note above the preferred bass range does not take over');

// Short supported notes need one extra result, rather than two, to light in Melody.
const fastTracker=new Notes.Tracker();
assert.equal(fastTracker.update(ev,melody,.45,1,0).length,0);
assert.equal(fastTracker.update(ev,melody,.45,1.034,34).length,1);
const fastRelease=fastTracker.update({peak:0,candidates:[]},melody,.45,1.05,50)[0];
assert.equal(Notes.highlightStrength(fastRelease,110),0);
assert.equal(fastTracker.update({peak:0,candidates:[]},melody,.45,1.111,111).length,0);
const phrase=[76,77,79,81,79,77,76,74];
const rapidWorker=worker(44100,recording(44100,2.5,[[48,.018],[52,.016],[55,.017],...phrase.map((midi,i)=>[midi,.12,.3+i*.14,.3+(i+1)*.14])]));
for(const speed of [.25,.5,1,2]) {
 const tr=new Notes.Tracker(),seen=new Set();let rest=0;
 for(let now=0;now<2000/speed;now+=1000/30) {
  const time=.2+now*speed/1000;if(time>2.2)break;
  const notes=tr.update(evidence(rapidWorker,time),melody,.45,time,now);
  const index=Math.floor((time-.3)/.14);
  if(index>=0&&index<phrase.length&&notes.some(n=>!n.releasing&&n.midi===phrase[index]))seen.add(index);
  if(time>1.75&&time<2.05){rest++;assert.equal(notes.length,0,`Rapid phrase rest at ${speed}: ${notes.map(n=>n.midi)}`);}
 }
 assert.equal(seen.size,phrase.length,`Rapid phrase at ${speed}: ${[...seen]}`);assert(rest);
}
console.log('Quick Melody admission, shorter release and all rapid phrase notes at every speed passed.');

// Out-of-range bass attacks during a rest must not claim the melody contour.
const rangeSettings=Notes.defaults();rangeSettings.mode='melody';rangeSettings.ranges.melody={low:60,high:84};
const bassAttacks=worker(44100,recording(44100,3,[[52,.015],[55,.015],[76,.12,.2,1],[48,.18,1.15,1.35],[48,.18,1.5,1.7],[48,.18,1.85,2.05],[77,.12,2.3,2.8]]));
for(const speed of [.25,.5,1,2]) {
 const tr=new Notes.Tracker();let before=false,after=false,rest=0;
 for(let now=0;now<2800/speed;now+=1000/30) {
  const time=.2+now*speed/1000;if(time>2.9)break;
  const notes=tr.update(evidence(bassAttacks,time),rangeSettings,.45,time,now);
  before ||= time<1&&notes.some(n=>n.midi===76&&!n.releasing);
  after ||= time>2.3&&notes.some(n=>n.midi===77&&!n.releasing);
  if(time>1.35&&time<2.1){rest++;assert.equal(notes.length,0,`Bass attack took over at speed ${speed}: ${time}, ${notes.map(n=>n.midi)}`);}
 }
 assert(before&&after&&rest,`Range preference keeps melody entry and re-entry at ${speed}`);
}
// Strong notes just outside the range stay eligible, but attacks need confirmation.
const nearOutside={peak:.1,candidates:[{midi:59,preciseMidi:59,score:.1,recentScore:.1,recentFundamental:.1,fundamental:true,prominence:10}]};
const nearTracker=new Notes.Tracker();
assert.equal(nearTracker.update(nearOutside,rangeSettings,.45,1,0).length,0);
assert.equal(nearTracker.update(nearOutside,rangeSettings,.45,1.033,33).length,0);
assert.equal(nearTracker.update(nearOutside,rangeSettings,.45,1.121,121).length,1);
assert.equal(new Notes.Tracker().update(nearOutside,rangeSettings,.45,1,0,false).length,1);
console.log('Melody range rejects rest-time bass attacks at all speeds, with confirmed soft-range exceptions passed.');

// Quiet in-range lines should be measured against their register, not louder bass.
const quietLine=worker(44100,recording(44100,4,[[48,.18],[52,.02],[76,.035,.3,1.5],[77,.03,2.3,3.5]]));
const softerPhrase=worker(44100,recording(44100,4,[[48,.025],[52,.022],[55,.023],[76,.12,.2,1],[77,.032,1,2],[78,.03,2.7,3.6]]));
for(const speed of [.25,.5,1,2]) {
 for(const [fixture,segments,restBounds] of [[quietLine,[[.65,1.25,76],[2.65,3.25,77]],[1.9,2.1]],
   [softerPhrase,[[.6,.9,76],[1.3,1.8,77],[3,3.4,78]],[2.3,2.5]]]) {
  const tr=new Notes.Tracker(),counts=segments.map(()=>[0,0]);let rest=0;
  for(let now=0;now<3500/speed;now+=1000/30) {
   const time=.2+now*speed/1000;if(time>3.7)break;
   const notes=tr.update(evidence(fixture,time),rangeSettings,.45,time,now);
   segments.forEach(([start,end,midi],i)=>{if(time>=start&&time<=end){counts[i][1]++;if(notes.some(n=>n.midi===midi&&!n.releasing))counts[i][0]++;}});
   if(time>restBounds[0]&&time<restBounds[1]){rest++;assert.equal(notes.length,0,`Quiet phrase rest at ${speed}: ${notes.map(n=>n.midi)}`);}
  }
  counts.forEach(([seen,total],i)=>assert(seen/total>=.85,`Quiet phrase ${segments[i][2]} at ${speed}: ${seen}/${total}`));
  assert(rest);
 }
}
console.log('Quiet melody over loud outside bass, softer pitch transitions, soft re-entry and rests at every speed passed.');
