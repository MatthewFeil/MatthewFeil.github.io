/* Text reference demos reuse the Quick start's inert player and deterministic scenes. */
import { reference, quickStart } from './transcribe-guide-lessons.js?v=20261025-full-guide';
const focus=(target,relatedTargets=[])=>({target,relatedTargets});
const panel={id:'controls',action:'panel',value:true,focus:focus('#transcribe-controls-toggle')};
const loaded={...quickStart.playback.start};
const selected={...loaded,position:6,selection:[6,10],selectionOnly:true,repeat:true};
const describe=(lesson,title,details)=>({...lesson,title,steps:lesson.steps.map((step,index)=>({...step,title:details[index][0],detail:details[index][1]}))});
export const fullReference={
 recording:describe(quickStart.open,'Loading an Audio File',[
  ['Open audio','Click Open audio, then choose a recording on your device. The loaded waveform appears here; the system file chooser is not illustrated.']]),
 timeline:describe(reference.timeline,'Timeline and Waveform',[
  ['Pan the timeline','Drag the overview window to another part of the recording. This pans the timeline without moving the playhead.'],
  ['Set the playback position','Click the waveform where you want to listen. A click without a drag also clears any highlight.'],
  ['Change Timeline zoom','Drag Timeline zoom to inspect a shorter span of audio.'],
  ['Create a selection','Press, drag across a passage, and release. Selection only and Repeat turn on automatically.'],
  ['Clear the selection','Click the waveform without dragging. Repeat and Selection only turn off.']]),
 transport:describe(reference.transport,'Playback and Looping',[
  ['Enable Selection only','The example starts with a highlight. Limit playback to it with Selection only.'],
  ['Enable Repeat','Turn Repeat on to play the selected passage again at its end.'],
  ['Start playback','Select Play. Playback repeats within the selected range.'],
  ['Pause playback','Click Pause to stop at the current position.'],
  ['Return to the selection start','Return to selection start moves the playhead to the beginning of the highlighted passage.'],
  ['Disable selection-only playback','Turn Selection only off. Repeat now applies to the whole track.']]),
 speed:describe(quickStart.speed,'Playback Speed',[
  ['Adjust playback speed','Select a playback speed while the loop continues. The example uses 70%.'],
  ['Restore the original speed','Choose 100%. The highlight remains in place.']]),
 sound:describe(reference.sound,'Sound Settings: Pitch Lock',[
  ['Reduce playback speed','Select a reduced playback speed. This example uses 70% and starts with Pitch lock off.'],
  ['Open Controls','Open Controls to access the Sound settings.'],
  ['Enable Pitch lock','Preserve the original pitch when playback speed changes.'],
  ['Close Controls','Return to the main workspace.'],
  ['Restore original speed','Choose 100% in the speed row.']]),
 pitch:describe({start:loaded,steps:[panel,
  {id:'transpose',action:'field-drag',key:'transpose',value:2,target:'#transcribe-semitones',from:.5,to:14/24,focus:focus('#transcribe-semitones')},
  {id:'reset',action:'sound-reset',focus:focus('#transcribe-section-sound .transcribe-section-reset',['#transcribe-section-sound'])}
 ]},'Sound Settings: Transpose',[
  ['Open Controls','Sound contains Pitch lock, Channel, Transpose, and Pitch correction.'],
  ['Adjust transposition','Drag Transpose to change pitch in semitones. This example raises the pitch by two semitones.'],
  ['Reset Sound','Reset restores the default Sound settings without changing playback speed or the selection.']]),
 notes:describe({start:loaded,steps:[{id:'compare',action:'piano',focus:focus('#transcribe-keyboard')}]},'Spectrum and Piano Keyboard',[
  ['Play a reference note','Press and hold a piano key, then release it. In Transcribe it sounds a comparison tone; this illustrated demonstration is silent.']]),
 analysis:describe({start:selected,steps:[panel,
  {id:'whole',action:'toggle-setting',key:'whole',value:true,target:'#transcribe-analyze-selection',focus:focus('#transcribe-analyze-selection')}
 ]},'Analysis Settings',[
  ['Open Controls','The example already has a highlighted passage.'],
  ['Analyze the selected passage','Enable Whole highlight to combine frequency information across the selected passage instead of inspecting only the playhead.']]),
 eq:describe({start:loaded,steps:[panel,
  {id:'band',action:'eq-drag',focus:focus('#transcribe-eq-graph')},
  {id:'reset',action:'eq-reset',focus:focus('#transcribe-eq-reset',['#transcribe-eq-graph'])}
 ]},'Equalizer (EQ)',[
  ['Open Controls','EQ is located below Sound and Analysis in Controls.'],
  ['Adjust a frequency band','Drag a band vertically to change gain or horizontally to change frequency. The example boosts the second band at 400 Hz.'],
  ['Reset EQ','Reset restores the flat response and default cutoffs.']]),
 stems:describe({start:{...selected,stemsReady:true,stemVocals:true},steps:[panel,
  {id:'mute',action:'toggle-setting',key:'stemVocals',value:false,target:'[data-stem="vocals"] button',focus:focus('[data-stem="vocals"]')},
  {id:'restore',action:'toggle-setting',key:'stemVocals',value:true,target:'[data-stem="vocals"] button',focus:focus('[data-stem="vocals"]')},
  {id:'reset',action:'stems-reset',focus:focus('#transcribe-section-stems .transcribe-section-reset',['#transcribe-section-stems'])}
 ]},'Stem Separation',[
  ['Open Controls','This example starts with a passage already separated. It illustrates the controls without downloading or running a model.'],
  ['Mute Vocals','Set Vocals to Off to mute the vocal stem. Other enabled stems remain in the mix.'],
  ['Enable Vocals','Set Vocals to On to include the vocal stem in the mix.'],
  ['Reset stem separation','Reset Stems clears the separated result and returns to the original recording.']]),
 measures:describe({start:{...loaded,markers:Array.from({length:12},(_,i)=>({time:i*2,label:`${i<6?'A':'B'}${i%6+1}`,section:i%6===0}))},steps:[
  {id:'move',action:'marker-drag',focus:focus('#transcribe-mark-ruler')},
  {id:'menu',action:'measure-menu',focus:focus('#transcribe-measures')},
  {id:'go',action:'measure-go',focus:focus('#transcribe-go-measure')}
 ]},'Measure and Section Markers',[
  ['Move a marker','This example already has measure and section markers. Drag A3 to adjust its position.'],
  ['Open measure navigation','Select mm. to open Go to, Loop start, Loop end, and measure numbering controls.'],
  ['Navigate to a measure','Enter B3 in Go to and press Enter. The playhead moves to that marker and the menu closes.']])
};
