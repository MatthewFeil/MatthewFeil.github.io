// Coordinate worker budgets without queuing camera frames. Rates are targets;
// slower cameras/devices may deliver less. Sustained pressure avoids mode flapping.
export class BirdScheduler {
  constructor() { this.reset(); }
  reset() {
    this.motionFps=30;this.analysisMs=0;this.motionMs=0;
    this.pressureSince=null;this.headroomSince=null;this.lastAnalysis=-Infinity;
  }
  baseInterval(tracks,now) {
    if(!tracks.length)return 160;
    if(tracks.some(t=>t.motionLost || now-t.seen>900))return 120;
    if(tracks.some(t=>!t.speciesId || now-(t.motionSeen ?? -Infinity)>200 || t.motionQuality<.4))return 220;
    return 400;
  }
  observeAnalysis(ms) { this.analysisMs=this.analysisMs>0 ? .75*this.analysisMs+.25*ms : ms; }
  observeMotion(ms,now,tracks) {
    this.motionMs=this.motionMs>0 ? .75*this.motionMs+.25*ms : ms;
    const base=this.baseInterval(tracks,now);
    const pressured=tracks.length && (this.motionMs>1000/30*.8 || this.analysisMs>base*.75);
    const headroom=this.motionMs<1000/30*.6 && this.analysisMs<base*.55;
    this.pressureSince=pressured?(this.pressureSince ?? now):null;
    this.headroomSince=headroom?(this.headroomSince ?? now):null;
    if(this.motionFps===30 && this.pressureSince!==null && now-this.pressureSince>=1500) {
      this.motionFps=24;this.headroomSince=null;
    } else if(this.motionFps===24 && this.headroomSince!==null && now-this.headroomSince>=5000) {
      this.motionFps=30;this.pressureSince=null;
    }
  }
  analysisDelay(tracks,now) {
    // Reserve time between analysis jobs; allow more analysis duty at 24 fps.
    const duty=tracks.length && this.baseInterval(tracks,now)===400 ? .45 : this.motionFps===30 ? .65 : .8;
    const interval=Math.max(this.baseInterval(tracks,now),this.analysisMs/duty);
    return Math.max(0,this.lastAnalysis+interval-now);
  }
}
