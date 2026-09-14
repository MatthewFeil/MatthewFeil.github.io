importScripts('transcribe-stems-core.js?v=20260912-highlight-only', 'transcribe-demucs-runtime.js?v=20260912-highlight-only');
self.onmessage = async ({data}) => {
  if (data.type !== 'separate') return;
  try {
    const stems = await TranscribeDemucs.separate(data.channels, (text,value=null)=>self.postMessage({type:'progress',text,value}));
    const inputRms = TranscribeStemAudio.rms(data.channels);
    const activity = stems.map(channels=>TranscribeStemAudio.activity(channels,inputRms));
    self.postMessage({type:'complete',stems,activity},stems.flat().map(c=>c.buffer));
  } catch(error) {
    self.postMessage({type:'error',text:`Separation failed. ${error?.message || error}. Try a shorter highlight if memory is low.`});
  } finally {await TranscribeDemucs.release();self.close();}
};
