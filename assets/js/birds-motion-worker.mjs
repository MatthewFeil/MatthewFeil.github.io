import {grayscale,pyramid,followBox} from './birds-motion.mjs?v=20261007-tracking1';
let previous,previousTime=0;
self.onmessage=({data})=>{
  if(data.type!=='frame')return;
  const started=performance.now(),current=pyramid(grayscale(data.rgba,data.width,data.height)),updates=[];
  if(previous && previous[0].width===data.width && previous[0].height===data.height && data.timestamp-previousTime<250) {
    for(const track of data.tracks) {
      const result=followBox(previous,current,track.box);
      updates.push({id:track.id,...(result||{}),lost:!result});
    }
  }
  previous=current;previousTime=data.timestamp;
  postMessage({type:'motion',timestamp:data.timestamp,updates,latencyMs:performance.now()-started});
};
