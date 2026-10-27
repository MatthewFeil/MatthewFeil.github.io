/* One ordered sequence per instructions section. State at any step is reproducible. */
const empty = { loaded: false, position: 0, selection: null, selectionOnly: false, repeat: false, speed: 1, pitchLock: true, viewStart: 0, viewDuration: 24, neutralViewport: true, playing: false, panel: false };
const loaded = { ...empty, loaded: true };
const focus = (target, relatedTargets = []) => ({ target, relatedTargets });
const play = (id = 'play', loop = false) => ({ id, action: 'play', loop, focus: focus('#transcribe-play') });
const pause = () => ({ id: 'pause', action: 'pause', focus: focus('#transcribe-play') });
const openSteps = [{ id: 'open', action: 'open', focus: focus('#transcribe-file-name') }, { id: 'choose', action: 'load' }, { id: 'ready', action: 'inspect' }];
const pan = { id: 'pan', action: 'pan', viewStart: 14 };
const seek = { id: 'seek', action: 'seek', position: 20 };
const speed = { id: 'speed', action: 'speed', speed: 0.7, focus: focus('[data-speed="0.7"]') };
const normal = { id: 'normal', action: 'speed', speed: 1, focus: focus('[data-speed="1"]') };
export const quickStart = {
  open: { start: empty, steps: [{ id: 'open', action: 'open', loadAfterClick: true, focus: focus('#transcribe-file-name') }] },
  playback: { start: loaded, steps: [play(), pause()] },
  find: { start: { ...loaded, position: 3 }, steps: [pan, seek, play()] },
  loop: { start: { ...loaded, position: 23, viewStart: 14, playing: true }, steps: [
    { id: 'highlight', action: 'highlight', range: [20,24] },
    { id: 'repeat', action: 'ensure-repeat', focus: focus('#transcribe-loop-bottom', ['#transcribe-selection-only','#transcribe-play']) }, play('play', true)
  ] },
  speed: { start: { ...loaded, position: 23, viewStart: 14, selection: [20,24], selectionOnly: true, repeat: true, playing: true }, steps: [speed, normal] }
};
export const reference = {
  recording: { start: empty, steps: openSteps },
  timeline: { start: loaded, steps: [pan, seek,
    { id: 'zoom', action: 'zoom', viewDuration: 12, focus: focus('.transcribe-timeline-zoom') },
    { id: 'highlight', action: 'highlight', range: [20,24] },
    { id: 'clear', action: 'seek', position: 22 }
  ] },
  transport: { start: { ...loaded, position: 6, selection: [6,10], selectionOnly: false }, steps: [
    { id: 'selection', action: 'selection', value: true, focus: focus('#transcribe-selection-only') },
    { id: 'repeat', action: 'repeat', value: true, focus: focus('#transcribe-loop-bottom', ['#transcribe-play']) }, play('play', true), pause(),
    { id: 'start', action: 'start', focus: focus('#transcribe-start') },
    { id: 'whole-track', action: 'selection', value: false, focus: focus('#transcribe-selection-only') }
  ] },
  sound: { start: { ...loaded, position: 6, selection: [6,10], selectionOnly: true, repeat: true, pitchLock: false }, steps: [speed,
    { id: 'controls', action: 'panel', value: true, focus: focus('#transcribe-controls-toggle') },
    { id: 'lock', action: 'lock', value: true, focus: focus('#transcribe-pitch-lock', []) },
    { id: 'close', action: 'panel', value: false, focus: focus('#transcribe-controls-toggle') }, normal
  ] }
};
export const legacyTopics = {
  open: ['recording','open'], find: ['timeline','pan'], overview: ['timeline','pan'], waveform: ['timeline','seek'],
  'timeline-zoom': ['timeline','zoom'], highlight: ['timeline','highlight'], clear: ['timeline','clear'],
  selection: ['transport','selection'], repeat: ['transport','repeat'], play: ['transport','play'], start: ['transport','start'],
  slow: ['sound','speed'], speed: ['sound','speed'], 'pitch-lock': ['sound','lock'], 'normal-speed': ['sound','normal']
};
export function afterStep(state, step) {
  const next = { ...state, selection: state.selection ? [...state.selection] : null };
  switch (step.action) {
    case 'open': if (step.loadAfterClick) Object.assign(next, loaded); break;
    case 'load': Object.assign(next, loaded); break;
    case 'pan': next.viewStart = step.viewStart; break;
    case 'seek': Object.assign(next, { position: step.position, selection: null, selectionOnly: false, repeat: false }); break;
    case 'zoom': next.viewDuration = step.viewDuration; break;
    case 'highlight': Object.assign(next, { selection: [...step.range], position: step.range[0], selectionOnly: true, repeat: true, neutralViewport: false }); break;
    case 'ensure-repeat': case 'repeat': next.repeat = step.value ?? true; break;
    case 'selection': next.selectionOnly = step.value; break;
    case 'play': next.playing = true; next.position = step.loop && next.selection ? next.selection[0] + (next.selection[1]-next.selection[0])*0.75 : next.position + 3; break;
    case 'pause': next.playing = false; break;
    case 'start': next.position = next.selectionOnly && next.selection ? next.selection[0] : 0; break;
    case 'speed': next.speed = step.speed; break;
    case 'lock': next.pitchLock = step.value; break;
    case 'panel': next.panel = step.value; break;
    case 'field-drag': next[step.key] = step.value; break;
    case 'toggle-setting': next[step.key] = step.value; break;
    case 'sound-reset': Object.assign(next,{transpose:0,pitchLock:true}); break;
    case 'eq-drag': next.eqGain=8; break;
    case 'eq-reset': next.eqGain=0; break;
    case 'stems-reset': next.stemsReady=false;next.stemVocals=true;break;
    case 'marker-drag': next.markers=state.markers.map((m,i)=>i===2?{...m,time:5}:m);break;
    case 'measure-menu': next.measureOpen=true;break;
    case 'measure-go': next.measureOpen=false;next.position=16;break;
  }
  return next;
}
export function beforeStep(lesson, index) {
  let state = { ...lesson.start, selection: lesson.start.selection ? [...lesson.start.selection] : null };
  for (const step of lesson.steps.slice(0,index)) state = afterStep(state, step);
  return state;
}
