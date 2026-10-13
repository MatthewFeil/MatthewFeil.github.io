// Exercise the real worker lifecycle with synthetic inference, not recognition accuracy.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as core from '../assets/js/birds-core.mjs';
const manifest=JSON.parse(readFileSync(new URL('../assets/models/birds/manifest.json',import.meta.url)));
const messages=[],logits=new Float32Array(525);let sessions=0,holdDetector;
const context2d={drawImage(){},fillRect(){},getImageData(){return {data:new Uint8ClampedArray(260*260*4)};}};
const sandbox={...core,decodeYolox:()=>[{box:[.2,.2,.6,.6],score:.9}],cropSharpness:()=>1,
 OffscreenCanvas:class {constructor(w,h){this.width=w;this.height=h;}getContext(){return context2d;}},
 Float32Array,Uint8ClampedArray,Uint8Array,Array,Map,Set,Math,Number,Infinity,URL,performance,navigator:{},
 self:{},postMessage:data=>messages.push(structuredClone(data)),
 crypto:{subtle:{digest:async(_,bytes)=>bytes}},
 fetch:async url=>({ok:true,json:async()=>manifest,arrayBuffer:async()=>Uint8Array.from((String(url).includes('yolox')?manifest.detector.sha256:manifest.options[0].classifier.sha256).match(/../g),s=>parseInt(s,16)).buffer}),
 mockOrt:{env:{wasm:{}},Tensor:class {dispose(){}},InferenceSession:{create:async()=>{const detector=sessions++===0;return {run:async()=>{if(detector&&holdDetector)await holdDetector.promise;return detector?{output:{data:[],dispose(){}}}:{logits:{data:logits,dispose(){}}};}};}}}
};
let source=readFileSync(new URL('../assets/js/birds-worker.mjs',import.meta.url),'utf8').replace(/^import .*;\n/,'').replaceAll('import.meta.url',"'http://localhost/assets/js/birds-worker.mjs'").replace("await import('./vendor/onnxruntime/ort.webgpu.bundle.min.mjs')",'mockOrt');
vm.runInNewContext(source,sandbox);
const send=data=>sandbox.self.onmessage({data});
const scope=(id,revision)=>send({type:'scope',scope:id,scopeRevision:revision});
async function frame(index,timestamp){logits.fill(-10);logits[index]=10;const bitmap={width:640,height:480,close(){this.closed=true;}};await send({type:'frame',bitmap,timestamp});assert.equal(bitmap.closed,true);return messages.filter(m=>m.type==='result').at(-1);}
await send({type:'init'});assert.equal(messages.at(-1).type,'ready');
await frame(23,990);assert.equal((await frame(23,1000)).detections[0].speciesId,'bird-23');
await scope('north-america',1);
await frame(20,1090);const expanded=await frame(20,1100);assert.equal(expanded.scopeRevision,1);assert.equal(expanded.detections[0].speciesId,'bird-20');assert.equal(expanded.detections[0].classificationFresh,true);
await scope('worldwide',2);await frame(3,1190);assert.equal((await frame(3,1200)).detections[0].speciesId,'bird-3');
// Changing scope while detector inference waits must leave that frame on its old revision.
let release;holdDetector={promise:new Promise(resolve=>{release=resolve;})};
const oldFrame=frame(3,2400);await new Promise(resolve=>setImmediate(resolve));
await scope('north-america',3);await scope('common-north-america',4);
release();const old=await oldFrame;holdDetector=null;
assert.equal(old.scopeRevision,2);
await frame(3,2490);const latest=await frame(3,2500);assert.equal(latest.scopeRevision,4);assert.equal(latest.detections[0].speciesId,null);assert.equal(latest.detections[0].classificationFresh,true);
assert.equal(sessions,2,'Scope switches reuse both inference sessions');
assert.equal(messages.some(m=>m.type==='error'),false);
console.log('Worker scope changes, fresh evidence, queued rapid switches, revision stamps and session reuse passed.');
