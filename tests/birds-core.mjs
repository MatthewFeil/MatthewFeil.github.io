import assert from 'node:assert/strict';
import {projectBox, iou, suppress, BirdTracker, assertRelease, probabilities, experimentOption, decodeYolox, searchWindows, mapWindowDetection, trackingWindow, cropSharpness, scopedSpeciesSuggestion, trackSupported, MOTION_BRIDGE_MS} from '../assets/js/birds-core.mjs';
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

const slowTracker=new BirdTracker(10000);
slowTracker.update([detection],0);slowTracker.update([detection],2000);
assert.equal(slowTracker.update([detection],4000)[0].speciesId,'robin');
const yolox={size:[416,416],strides:[8,16,32],birdClass:14,threshold:.3};
const raw=new Float32Array(3549*85);
// One 80x80 bird at the first grid cell; ensure padding/ratio undone correctly.
raw[0]=10;raw[1]=10;raw[2]=Math.log(10);raw[3]=Math.log(10);raw[4]=1;raw[19]=.9;
const decoded=decodeYolox(raw,yolox,832,416);
assert.equal(decoded.length,1);assert.ok(Math.abs(decoded[0].box[0]-40/416)<1e-6);
assert.throws(()=>experimentOption({experimental:{enabled:false}},'small'),/disabled/);
console.log('YOLOX decoding and slower-device stabilization passed.');

for(const [width,height] of [[3840,2160],[2160,3840],[640,640]]) {
 const windows=searchWindows(width,height);
 for(const [x,y,w,h] of windows) {assert.ok(x>=0&&y>=0&&x+w<=width&&y+h<=height);assert.equal(w,h);}
 for(let y=0;y<=height;y+=height/20) for(let x=0;x<=width;x+=width/20) {
   assert.ok(windows.some(([a,b,w,h])=>x>=a&&x<=a+w&&y>=b&&y<=b+h),'Every scene position must be searched');
 }
 const win=trackingWindow([.95,.95,1,1],width,height);
 assert.ok(win[0]+win[2]<=width&&win[1]+win[3]<=height);
}
assert.deepEqual(mapWindowDetection({box:[.2,.3,.8,.9],score:.9},[100,200,400,400],1000,1000).box,[.18,.32,.42,.56]);
assert.equal(mapWindowDetection({box:[0,.3,.8,.9]},[100,200,400,400],1000,1000),null);
assert.ok(mapWindowDetection({box:[0,.3,.8,.9]},[0,0,400,400],1000,1000));
assert.equal(suppress([{box:[.18,.32,.42,.56],score:.8},mapWindowDetection({box:[.2,.3,.8,.9],score:.9},[100,200,400,400],1000,1000)]).length,1);
console.log('Distance scan coverage, tile-edge handling, tracking crops and duplicate suppression passed.');

const evidenceTracker=new BirdTracker(10000);
evidenceTracker.update([detection],0);
for(let i=1;i<5;i++)assert.equal(evidenceTracker.update([{...detection,classificationFresh:false}],i*100)[0].speciesId,null);
evidenceTracker.update([detection],800);
assert.equal(evidenceTracker.update([detection],1600)[0].speciesId,'robin');
assert.equal(evidenceTracker.update([{box:detection.box}],1700,true)[0].speciesId,'robin');
const flat=new Uint8ClampedArray(32*32*4).fill(128),edges=flat.slice();
for(let y=0;y<32;y++)for(let x=0;x<32;x++)for(let c=0;c<3;c++)edges[(y*32+x)*4+c]=((x>>2)+(y>>2))%2?255:0;
assert.equal(cropSharpness(flat,32,32),0);
assert.ok(cropSharpness(edges,32,32)>1000);
console.log('Sharpness signal and fresh-classification-only stabilization passed.');

const blurred=edges.slice();
for(let y=1;y<31;y++)for(let x=1;x<31;x++)for(let c=0;c<3;c++) {
 let sum=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=edges[((y+dy)*32+x+dx)*4+c];
 blurred[(y*32+x)*4+c]=sum/9;
}
assert.ok(cropSharpness(blurred,32,32)<cropSharpness(edges,32,32)*.7);
console.log('Blurred crop falls below the relative sharpness threshold.');

const movingIdentity=new BirdTracker(10000);
movingIdentity.update([detection],0);movingIdentity.update([detection],350);
const named=movingIdentity.update([detection],700)[0];named.flowDx=.3;
const moved=movingIdentity.update([{box:[.65,.3,.95,.6],trackId:named.id}],800,true,650)[0];
assert.equal(moved.id,named.id);assert.equal(moved.speciesId,'robin');assert.equal(moved.flowDx,.3);
assert.equal(movingIdentity.update([],1000,true,650).length,1);
assert.equal(movingIdentity.update([],1600,true,650).length,0);
console.log('Motion identity, name retention, detector-gap bridging and expiry passed.');

const regionLabels=[{id:'goldfinch'},{id:'foreign'},{id:'robin'}],regionAllowed=new Set(['goldfinch','robin']),cutoffs={threshold:.65,margin:.2};
assert.equal(scopedSpeciesSuggestion([.8,.15,.05],regionLabels,cutoffs,regionAllowed),'goldfinch');
assert.equal(scopedSpeciesSuggestion([.05,.9,.05],regionLabels,cutoffs,regionAllowed),null);
assert.equal(scopedSpeciesSuggestion([.4,.35,.25],regionLabels,cutoffs,regionAllowed),null);
assert.equal(scopedSpeciesSuggestion([.65,.3,.05],regionLabels,cutoffs,regionAllowed),'goldfinch');
assert.equal(scopedSpeciesSuggestion([.45,.5,.05],regionLabels,cutoffs,regionAllowed),null);
console.log('Regional filtering preserves global confidence and rejects unsupported winners.');

// Reliable image motion bridges a real detector outage; stale or failed motion cannot.
const continuous=new BirdTracker(10000);
continuous.update([detection],0);continuous.update([detection],350);
const confirmed=continuous.update([detection],700)[0];
confirmed.motionSeen=2500;confirmed.motionQuality=.75;
assert.equal(continuous.update([],2500,true,650)[0].id,confirmed.id);
assert.equal(continuous.tracks[0].speciesId,'robin');
assert.equal(trackSupported(confirmed,2701),false,'Do not bridge stale motion');
confirmed.motionSeen=4300;
assert.equal(trackSupported(confirmed,700+MOTION_BRIDGE_MS+1),false,'Motion cannot keep a ghost indefinitely');
confirmed.motionLost=true;confirmed.motionLostAt=900;
assert.equal(trackSupported(confirmed,950),true,'Allow one short flow failure');
assert.equal(trackSupported(confirmed,1151),false,'Expire a sustained flow failure');
confirmed.motionLost=false;
// An absent cached classifier result is not a fresh vote against an established name.
assert.equal(continuous.update([{...detection,classificationFresh:false,speciesId:null}],2800)[0].speciesId,'robin');
assert.equal(continuous.update([{...detection,classificationFresh:true,speciesId:null}],2900)[0].speciesId,null);
console.log('Sustained detector-gap continuity, bounded expiry and cached-name retention passed.');
