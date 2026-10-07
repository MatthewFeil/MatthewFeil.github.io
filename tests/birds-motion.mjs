import assert from 'node:assert/strict';
import {pyramid,followBox,advanceByMotion} from '../assets/js/birds-motion.mjs';
let seed=1234567;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>24)&255;};
const width=240,height=160,data=Uint8Array.from({length:width*height},random),base={data,width,height},box=[.25,.3,.55,.7];
function shifted(dx,dy,objectOnly=false) {
 const out=objectOnly?data.slice():new Uint8Array(data.length).fill(128);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  if(objectOnly && !(x>=box[0]*width&&x<box[2]*width&&y>=box[1]*height&&y<box[3]*height))continue;
  if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)out[(y+dy)*width+x+dx]=data[y*width+x];
 }
 return {data:out,width,height};
}
for(const [dx,dy] of [[3,2],[12,-6],[-16,8]]) {
 const result=followBox(pyramid(base),pyramid(shifted(dx,dy)),box);
 assert.ok(result,`Camera shift ${dx},${dy} must track`);
 assert.ok(Math.abs((result.box[0]-box[0])*width-dx)<=1);
 assert.ok(Math.abs((result.box[1]-box[1])*height-dy)<=1);
}
const object=followBox(pyramid(base),pyramid(shifted(8,3,true)),box);assert.ok(object);
assert.ok(Math.abs((object.box[0]-box[0])*width-8)<=1);
assert.equal(followBox(pyramid(base),pyramid({data:new Uint8Array(data.length).fill(128),width,height}),box),null);
assert.equal(followBox(pyramid({data:new Uint8Array(data.length),width,height}),pyramid(base),box),null);
const anchor={flowDx:0,flowDy:0},current={flowDx:.1,flowDy:.2};
const advanced=advanceByMotion([.2,.2,.4,.4],anchor,current);
assert.ok(Math.abs(advanced[0]-.3)<1e-10&&Math.abs(advanced[1]-.4)<1e-10);
// Repeated AI replies from the same capture must not compound detector corrections.
assert.deepEqual(advanceByMotion([.2,.2,.4,.4],anchor,{...current,box:advanced}),advanced);

console.log('Motion tracking: camera movement, independent object movement, disappearance, low texture and delayed-box alignment passed.');
