// Small grayscale frames, corner patches, pyramidal matching and forward/backward checks.
// This tracks image motion only; detector confirmations remain the authority on bird presence.
export function grayscale(rgba,width,height) {
  const data=new Uint8Array(width*height);
  for(let i=0;i<data.length;i++)data[i]=(77*rgba[i*4]+150*rgba[i*4+1]+29*rgba[i*4+2])>>8;
  return {data,width,height};
}
function half(image) {
  const width=Math.floor(image.width/2),height=Math.floor(image.height/2),data=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=y*2*image.width+x*2;data[y*width+x]=(image.data[i]+image.data[i+1]+image.data[i+image.width]+image.data[i+image.width+1])>>2;
  }
  return {data,width,height};
}
export function pyramid(image) {return [image,half(image)];}
function corners(image,box) {
  const {data,width,height}=image,found=[];
  const x1=Math.max(5,Math.ceil(box[0]*width)),y1=Math.max(5,Math.ceil(box[1]*height));
  const x2=Math.min(width-6,Math.floor(box[2]*width)),y2=Math.min(height-6,Math.floor(box[3]*height));
  const step=Math.max(2,Math.floor(Math.min(x2-x1,y2-y1)/12));
  for(let y=y1;y<=y2;y+=step)for(let x=x1;x<=x2;x+=step) {
    let xx=0,yy=0,xy=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      const i=(y+dy)*width+x+dx,gx=data[i+1]-data[i-1],gy=data[i+width]-data[i-width];xx+=gx*gx;yy+=gy*gy;xy+=gx*gy;
    }
    const score=(xx*yy-xy*xy)/(xx+yy+1);
    if(score>200)found.push({x,y,score});
  }
  found.sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const p of found) {if(selected.every(q=>(p.x-q.x)**2+(p.y-q.y)**2>25))selected.push(p);if(selected.length>=12)break;}
  return selected;
}
function match(a,b,x,y,cx,cy,radius,patch=2) {
  if(x<patch||y<patch||x>=a.width-patch||y>=a.height-patch)return null;
  let best=null,score=Infinity;
  for(let v=Math.max(patch,cy-radius);v<=Math.min(b.height-patch-1,cy+radius);v++)for(let u=Math.max(patch,cx-radius);u<=Math.min(b.width-patch-1,cx+radius);u++) {
    let error=0;
    for(let dy=-patch;dy<=patch;dy++)for(let dx=-patch;dx<=patch;dx++) {
      const diff=a.data[(y+dy)*a.width+x+dx]-b.data[(v+dy)*b.width+u+dx];error+=diff*diff;
    }
    if(error<score) {score=error;best={x:u,y:v,error:error/(2*patch+1)**2};}
  }
  return best;
}
const median=values=>{const s=[...values].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};
export function followBox(before,after,box) {
  const points=corners(before[0],box),flows=[];
  for(const p of points) {
    const x=p.x>>1,y=p.y>>1,c=match(before[1],after[1],x,y,x,y,10);
    if(!c)continue;
    const fine=match(before[0],after[0],p.x,p.y,c.x*2,c.y*2,3,3);
    if(!fine||fine.error>1800)continue;
    const reverse=match(after[0],before[0],fine.x,fine.y,p.x,p.y,3,3);
    if(!reverse || Math.hypot(reverse.x-p.x,reverse.y-p.y)>1.5)continue;
    flows.push({dx:fine.x-p.x,dy:fine.y-p.y,p,q:fine});
  }
  if(flows.length<3)return null;
  const dx=median(flows.map(f=>f.dx)),dy=median(flows.map(f=>f.dy));
  const good=flows.filter(f=>Math.hypot(f.dx-dx,f.dy-dy)<=2.5);
  if(good.length<3||good.length<points.length*.4)return null;
  // Robust translation avoids unstable scale estimates on small or partially occluded birds.
  const moved=box.map((v,i)=>v+(i%2?dy/after[0].height:dx/after[0].width));
  if(moved[2]<=0||moved[3]<=0||moved[0]>=1||moved[1]>=1)return null;
  return {box:moved.map(v=>Math.max(0,Math.min(1,v))),dx:dx/after[0].width,dy:dy/after[0].height,quality:good.length/Math.max(1,points.length)};
}
export function advanceByMotion(box,anchor,current) {
  const dx=(current.flowDx||0)-(anchor.flowDx||0),dy=(current.flowDy||0)-(anchor.flowDy||0);
  return box.map((v,i)=>Math.max(0,Math.min(1,v+(i%2?dy:dx))));
}

// Display-only smoothing: detection/tracking boxes remain the source of truth.
export function smoothTrackingBox(previous,target,elapsedMs) {
  if(!previous || elapsedMs>=200)return [...target];
  const center=box=>[(box[0]+box[2])/2,(box[1]+box[3])/2];
  const before=center(previous),after=center(target),distance=Math.hypot(after[0]-before[0],after[1]-before[1]);
  // Reacquisition and large jumps should land immediately, never drift across the view.
  if(distance>.18)return [...target];
  if(elapsedMs<=0)return [...previous];
  // Size settles more slowly than position to damp rapid detector crop fluctuations.
  const dt=elapsedMs,position=1-Math.exp(-dt/(distance>.02?28:45)),size=1-Math.exp(-dt/240);
  const x=before[0]+(after[0]-before[0])*position,y=before[1]+(after[1]-before[1])*position;
  const width=(previous[2]-previous[0])+((target[2]-target[0])-(previous[2]-previous[0]))*size;
  const height=(previous[3]-previous[1])+((target[3]-target[1])-(previous[3]-previous[1]))*size;
  const box=[x-width/2,y-height/2,x+width/2,y+height/2];
  return Math.max(...box.map((v,i)=>Math.abs(v-target[i])))<.0002?[...target]:box;
}

// Only integrate the portion of a motion interval newer than the track's position.
export function motionFraction(track,fromTimestamp,timestamp) {
  const applied=Math.max(track.seen ?? -Infinity,track.motionSeen ?? -Infinity);
  if(!Number.isFinite(timestamp) || timestamp<=applied)return 0;
  if(!Number.isFinite(fromTimestamp))return 1;
  if(timestamp<=fromTimestamp)return 0;
  return Math.min(1,(timestamp-Math.max(applied,fromTimestamp))/(timestamp-fromTimestamp));
}
