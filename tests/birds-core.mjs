import assert from 'node:assert/strict';
import {projectBox, iou, suppress, BirdTracker, assertRelease, probabilities} from '../assets/js/birds-core.mjs';
// Portrait crop: horizontal source edges are outside view; middle bird remains aligned.
assert.equal(projectBox([0,0,.1,1],1920,1080,390,844),null);
const r=projectBox([.4,.3,.6,.6],1920,1080,390,844);
assert.ok(r.x>=0 && r.x+r.width<=390 && r.y+r.height<=844);
assert.deepEqual(projectBox([0,0,1,1],1920,1080,390,844),{x:0,y:0,width:390,height:844});
assert.equal(iou([0,0,1,1],[0,0,1,1]),1);
assert.equal(suppress([{box:[0,0,1,1],score:.8},{box:[0,0,1,1],score:.9}]).length,1);
assert.ok(Math.abs(probabilities([1000,1000])[0]-.5)<1e-10);
const tracker=new BirdTracker(), detection={box:[.3,.3,.6,.6],speciesId:'robin'};
assert.equal(tracker.update([detection],0)[0].speciesId,null);
assert.equal(tracker.update([detection],500)[0].speciesId,null);
assert.equal(tracker.update([detection],1000)[0].speciesId,'robin');
assert.equal(tracker.update([{...detection,speciesId:'sparrow'}],1500)[0].speciesId,null);
assert.deepEqual(tracker.update([],2000),[]);
assert.throws(()=>assertRelease({release:{approved:false}}),/validation/);
assert.throws(()=>assertRelease({release:{approved:true},species:[]}),/incomplete/);
console.log('Bird geometry, matching, stabilization and release gates passed.');
