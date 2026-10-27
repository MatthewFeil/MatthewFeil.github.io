/* Precomputed recording data keeps the documentation copy inert. */
import audio from '../audio/transcribe-guide/example-data.js?v=20261024-recording';
export const audioDuration = audio.duration;
const timecode = seconds => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
const selection = [6, 10];
const markers = Array.from({ length: 12 }, (_, index) => ({
  time: index * 2, label: `${index < 6 ? 'A' : 'B'}${index % 6 + 1}`, section: index % 6 === 0
}));
const examples = {
  empty: { loaded: false },
  loaded: { loaded: true },
  highlighted: { loaded: true, selection, repeat: true },
  slowed: { loaded: true, selection, repeat: true, speed: 0.7 },
  cleared: { loaded: true, speed: 0.7 },
  // Ready for the later measure/section documentation; earlier steps stay unmarked.
  measures: { loaded: true, selection, repeat: true, markers }
};
const black = midi => [1, 3, 6, 8, 10].includes(midi % 12);
const whiteBefore = midi => {
  let count = 0;
  for (let note = 24; note < midi; note++) if (!black(note)) count++;
  return count;
};
const noteX = (midi, width) => (whiteBefore(midi) + (black(midi) ? 0 : 0.5)) / 42 * width;

function surface(app, id, colors) {
  const canvas = app.querySelector(`#${id}`);
  const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
  const ratio = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = colors.bg;
  context.fillRect(0, 0, width, height);
  context.font = '700 11px "Familjen Grotesk", Arial, sans-serif';
  context.textBaseline = 'top';
  return { canvas, context, width, height };
}
function line(context, x1, y1, x2, y2, color, thickness = 1) {
  context.strokeStyle = color; context.lineWidth = thickness;
  context.beginPath(); context.moveTo(x1, y1); context.lineTo(x2, y2); context.stroke();
}
function grid({ context, width, height }, colors) {
  for (let x = 0; x < width; x += 100) line(context, x + 0.5, 0, x + 0.5, height, colors.grid);
  line(context, 0, height / 2, width, height / 2, colors.grid);
}
function peaks(context, width, center, amplitude, colors, channelIndex = 0, viewStart = 0, viewDuration = 24) {
  context.fillStyle = colors.ink;
  const channel = audio.peaks[channelIndex];
  for (let x = 0; x < width; x += 1.5) {
    const first = Math.max(0, Math.floor((viewStart + x / width * viewDuration) * audio.peakRate));
    const end = Math.min(channel.length, Math.ceil((viewStart + (x + 1.5) / width * viewDuration) * audio.peakRate));
    let peak = 0;
    for (let index = first; index < end; index++) peak = Math.max(peak, channel[index]);
    const value = peak / 255 * amplitude;
    context.fillRect(x, center - value, 1.5, value * 2);
  }
}
function drawOverview(app, example, colors) {
  const drawing = surface(app, 'transcribe-overview', colors);
  const { context, width, height } = drawing;
  if (!example.loaded) return grid(drawing, colors);
  peaks(context, width, height * 0.62, height * 0.26, colors, 0, 0, audioDuration);
  context.fillStyle = colors.muted;
  for (let time = 0; time <= audioDuration; time += width < 600 ? 60 : 30) {
    const x = time / audioDuration * width;
    context.fillText(timecode(time), x + 4, 3);
  }
  const viewportX = (example.viewStart ?? 0) / audioDuration * width;
  const viewportWidth = width * (example.viewDuration ?? 24) / audioDuration;
  if (!example.neutralViewport) {
    context.fillStyle = colors.grid;
    context.fillRect(viewportX, 20, viewportWidth, Math.max(1, height - 23));
  }
  context.strokeStyle = example.neutralViewport ? colors.muted : colors.accent; context.lineWidth = 1;
  context.strokeRect(viewportX + 0.5, 20.5, viewportWidth - 1, Math.max(1, height - 24));
  if (example.selection) {
    context.fillStyle = colors.soft;
    context.fillRect(example.selection[0] / audioDuration * width, 0, (example.selection[1] - example.selection[0]) / audioDuration * width, height);
  }
}
function drawWaveform(app, example, colors) {
  const drawing = surface(app, 'transcribe-waveform', colors);
  const { context, width, height } = drawing;
  if (!example.loaded) return grid(drawing, colors);
  const viewStart = example.viewStart ?? 0, viewDuration = example.viewDuration ?? 24;
  const step = width < 600 ? 5 : 2;
  for (let time = Math.ceil(viewStart / step) * step; time <= viewStart + viewDuration; time += step) {
    const x = (time - viewStart) / viewDuration * width;
    line(context, x + 0.5, 0, x + 0.5, height, colors.grid);
    context.fillStyle = colors.muted;
    context.fillText(timecode(time), x + 4, 6);
  }
  const header = Math.min(52, height * 0.22), channelHeight = (height - header - 10) / 2;
  if (example.selection) {
    const x = (example.selection[0] - viewStart) / viewDuration * width, selectedWidth = (example.selection[1] - example.selection[0]) / viewDuration * width;
    context.fillStyle = colors.soft; context.fillRect(x, 0, selectedWidth, height);
    context.strokeStyle = colors.accent;
    context.strokeRect(x + 0.5, 30.5, selectedWidth - 1, Math.max(1, height - 31));
    context.fillStyle = colors.accent;
    for (const edge of [x, x + selectedWidth]) context.fillRect(edge - 4, 30, 8, 20);
  }
  peaks(context, width, header + channelHeight / 2, channelHeight * 0.43, colors, 0, viewStart, viewDuration);
  peaks(context, width, header + channelHeight * 1.5 + 10, channelHeight * 0.43, colors, 1, viewStart, viewDuration);
  if (example.showPlayhead !== false) {
    const playhead = ((example.position ?? 8) - viewStart) / viewDuration * width;
    line(context, playhead, 0, playhead, height, colors.accent, 1.5);
  }
}
function drawRuler(app, example, colors) {
  const { canvas, context, width, height } = surface(app, 'transcribe-mark-ruler', colors);
  canvas.dataset.markerCount = String(example.markers?.length || 0);
  let right = -Infinity;
  for (const marker of example.markers || []) {
    const x = (marker.time - (example.viewStart ?? 0)) / (example.viewDuration ?? 24) * width;
    line(context, x + 0.5, marker.section ? 0 : 19, x + 0.5, height, marker.section ? colors.ink : colors.muted);
    if (x > right) {
      context.fillStyle = colors.ink; context.fillText(marker.label, x + 4, 3);
      right = x + context.measureText(marker.label).width + 12;
    }
  }
}
function drawAnalysis(app, example, colors) {
  const { context, width, height } = surface(app, 'transcribe-spectrogram', colors);
  for (let row = 0; row <= 4; row++) line(context, 0, row / 4 * height, width, row / 4 * height, colors.grid);
  for (let midi = 24; midi < 96; midi += 12) line(context, noteX(midi, width), 0, noteX(midi, width), height, colors.grid);
  const frame = Math.max(0, Math.min(audio.spectra.length - 1, Math.round((example.position ?? 8) / audio.spectrumStep)));
  let levels = audio.spectra[frame];
  if(example.whole&&example.selection){
    const frames=audio.spectra.slice(Math.floor(example.selection[0]/audio.spectrumStep),Math.ceil(example.selection[1]/audio.spectrumStep));
    if(frames.length)levels=levels.map((_,i)=>frames.reduce((sum,row)=>sum+row[i],0)/frames.length);
  }
  const activeNotes = [];
  if (example.loaded) {
    context.beginPath();
    for (let index = 0; index < levels.length; index++) {
      const midi = audio.spectrumMidiStart + index / audio.spectrumBinsPerNote;
      const lower = Math.floor(midi), fraction = midi - lower;
      const x = noteX(lower, width) * (1 - fraction) + noteX(lower + 1, width) * fraction;
      const y = height - 5 - levels[index] / 255 * (height - 10);
      if (!index) context.moveTo(x, y); else context.lineTo(x, y);
      if (index > 0 && index < levels.length - 1 && levels[index] > 110 && levels[index] > levels[index - 1] && levels[index] >= levels[index + 1]) activeNotes.push({ midi: Math.round(midi), level: levels[index] });
    }
    context.strokeStyle = colors.ink; context.lineWidth = 2; context.stroke();
  }
  const sounding = activeNotes.sort((a, b) => b.level - a.level).slice(0, 5).map(note => note.midi);
  if(example.piano)sounding.push(60);
  const keys = surface(app, 'transcribe-keyboard', colors);
  const keyWidth = keys.width / 42;
  for (let midi = 24; midi < 96; midi++) {
    if (black(midi)) continue;
    const x = whiteBefore(midi) * keyWidth;
    keys.context.fillStyle = example.loaded && sounding.includes(midi) ? colors.accent : '#f6f6f6';
    keys.context.fillRect(x, 0, keyWidth + 1, keys.height);
    keys.context.strokeStyle = '#292929'; keys.context.lineWidth = 1;
    keys.context.strokeRect(x + 0.5, 0.5, keyWidth, keys.height - 1);
    if (midi % 12 === 0) {
      keys.context.fillStyle = '#171717';
      keys.context.fillText(`C${midi / 12 - 1}`, x + 2, Math.max(0, keys.height - 17));
    }
  }
  for (let midi = 24; midi < 96; midi++) if (black(midi)) {
    keys.context.fillStyle = example.loaded && sounding.includes(midi) ? colors.accent : '#090909';
    keys.context.fillRect(whiteBefore(midi) * keyWidth - keyWidth * 0.31, 0, keyWidth * 0.62, keys.height * 0.64);
  }
  const viewport = app.querySelector('#transcribe-analysis-grid');
  viewport.scrollLeft = matchMedia('(max-width: 720px), (max-height: 500px) and (pointer: coarse)').matches
    ? Math.min(viewport.scrollWidth - viewport.clientWidth, whiteBefore(53) / 42 * keys.width) : 0;
}

function illustrationColors() {
  const theme = getComputedStyle(document.documentElement);
  const color = name => theme.getPropertyValue(name).trim();
  const colors = { bg: color('--tr-bg'), ink: color('--tr-text'), muted: color('--tr-muted'),
    grid: color('--tr-grid'), accent: color('--tr-accent'), soft: color('--tr-accent-soft') };
  return colors;
}

export function renderIllustration(app, state = 'loaded', overrides = {}) {
  const example = { ...(examples[state] || examples.loaded), ...overrides };
  const colors = illustrationColors();
  app.dataset.exampleState = state;
  app.dataset.demoViewStart = String(example.viewStart ?? 0);
  app.dataset.demoViewDuration = String(example.viewDuration ?? 24);
  for (const element of app.querySelectorAll('.transcribe-workspace, .transcribe-timeline')) element.classList.toggle('has-markers', Boolean(example.markers?.length));
  app.querySelector('#transcribe-file-name').textContent = example.loaded ? 'example.mp3' : 'Open audio';
  const position = example.loaded ? example.position ?? 8 : 0;
  app.querySelector('#transcribe-timecode').textContent = timecode(position);
  app.querySelector('#transcribe-time-remaining').textContent = `-${timecode(example.loaded ? audioDuration - position : 0)}`;
  const seek = app.querySelector('#transcribe-seek');
  seek.max = example.loaded ? String(audioDuration) : '0'; seek.value = String(position);
  for (const button of app.querySelectorAll('[data-speed]')) {
    const selected = Number(button.dataset.speed) === (example.speed || 1);
    button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected));
  }
  for (const [id, selected] of [['transcribe-selection-only', example.selectionOnly ?? Boolean(example.selection)], ['transcribe-loop-bottom', Boolean(example.repeat)]]) {
    const button = app.querySelector(`#${id}`);
    button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected));
  }
  const pitchLock = app.querySelector('#transcribe-pitch-lock');
  pitchLock.setAttribute('aria-pressed', String(example.pitchLock !== false));
  pitchLock.classList.toggle('is-active', example.pitchLock !== false);
  pitchLock.querySelector('strong').textContent = example.pitchLock === false ? 'Off' : 'On';
  const play = app.querySelector('#transcribe-play');
  play.classList.toggle('is-playing', Boolean(example.playing));
  play.setAttribute('aria-label', example.playing ? 'Pause' : 'Play');
  const selectionOnly = example.selectionOnly ?? Boolean(example.selection);
  app.querySelector('#transcribe-start').setAttribute('aria-label', selectionOnly ? 'Return to selection start' : 'Return to track start');
  app.querySelector('#transcribe-loop-bottom').setAttribute('aria-label', selectionOnly ? 'Loop selection' : 'Loop whole track');
  for (const control of app.querySelectorAll('.transcribe-transport button, .transcribe-transport input, #transcribe-config-actions button')) control.disabled = !example.loaded;
  drawOverview(app, example, colors);
  drawWaveform(app, example, colors);
  drawRuler(app, example, colors);
  drawAnalysis(app, example, colors);
  renderReferenceControls(app,example);
}

// Cache the static drawings so gesture frames only repaint the two timeline canvases.
export function createTimelinePainter(app, state, overrides = {}) {
  renderIllustration(app, state, { ...overrides, showPlayhead: false });
  const theme = getComputedStyle(document.documentElement);
  const accent = theme.getPropertyValue('--tr-accent').trim();
  const soft = theme.getPropertyValue('--tr-accent-soft').trim();
  const images = ['transcribe-waveform', 'transcribe-overview'].map(id => {
    const canvas = app.querySelector(`#${id}`), image = document.createElement('canvas');
    image.width = canvas.width; image.height = canvas.height;
    image.getContext('2d').drawImage(canvas, 0, 0);
    return { canvas, image };
  });
  let spectrumFrame;
  return ({ selection: range, position }) => {
    for (const { canvas, image } of images) {
      const context = canvas.getContext('2d');
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      if (range && range[1] > range[0]) {
        const overview = canvas.id === 'transcribe-overview';
        const x = (range[0] - (overview ? 0 : overrides.viewStart ?? 0)) / (overview ? audioDuration : overrides.viewDuration ?? 24) * width;
        const selectedWidth = (range[1] - range[0]) / (overview ? audioDuration : overrides.viewDuration ?? 24) * width;
        context.fillStyle = soft; context.fillRect(x, 0, selectedWidth, height);
        if (!overview) {
          context.strokeStyle = accent; context.lineWidth = 1;
          context.strokeRect(x + 0.5, 30.5, Math.max(1, selectedWidth - 1), Math.max(1, height - 31));
          context.fillStyle = accent;
          for (const edge of [x, x + selectedWidth]) context.fillRect(edge - 4, 30, 8, 20);
        }
      }
      if (canvas.id === 'transcribe-waveform' && Number.isFinite(position)) line(context, (position - (overrides.viewStart ?? 0)) / (overrides.viewDuration ?? 24) * width, 0, (position - (overrides.viewStart ?? 0)) / (overrides.viewDuration ?? 24) * width, height, accent, 1.5);
    }
    if (Number.isFinite(position)) {
      app.querySelector('#transcribe-timecode').textContent = timecode(position);
      app.querySelector('#transcribe-time-remaining').textContent = `-${timecode(audioDuration - position)}`;
      app.querySelector('#transcribe-seek').value = String(position);
      const nextFrame = Math.round(position / audio.spectrumStep);
      if (nextFrame !== spectrumFrame) {
        drawAnalysis(app, { loaded: true, position }, illustrationColors());
        spectrumFrame = nextFrame;
      }
    }
    app.dataset.demoSelectionEnd = range ? String(range[1]) : '';
  };
}

// Repaint only the timeline while the overview window is being dragged.
export function createViewportPainter(app, overrides = {}) {
  const example = { loaded: true, position: 8, viewStart: 0, viewDuration: 24, neutralViewport: true, ...overrides };
  renderIllustration(app, 'loaded', example);
  const colors = illustrationColors();
  return value => {
    if (typeof value === 'number') example.viewStart = value;
    else Object.assign(example, value);
    drawOverview(app, example, colors);
    drawWaveform(app, example, colors);
    drawRuler(app, example, colors);
    app.dataset.demoViewStart = String(example.viewStart);
    app.dataset.demoViewDuration = String(example.viewDuration);
  };
}

// Deterministic illustrated controls, never app handlers or processing jobs.
function renderReferenceControls(app,example){
  const transpose=example.transpose||0;
  for(const id of ['transcribe-semitones','transcribe-semitones-number'])app.querySelector('#'+id).value=transpose;
  const whole=app.querySelector('#transcribe-analyze-selection');
  whole.setAttribute('aria-pressed',String(Boolean(example.whole)));whole.classList.toggle('is-active',Boolean(example.whole));whole.querySelector('strong').textContent=example.whole?'On':'Off';
  const list=app.querySelector('.transcribe-stem-list');list.hidden=!example.stemsReady;
  const master=app.querySelector('#transcribe-stems-enabled');master.parentElement.hidden=Boolean(example.stemsReady);master.disabled=!example.selection;
  for(const row of list.children){const enabled=row.dataset.stem!=='vocals'||example.stemVocals!==false,button=row.querySelector('button');button.textContent=enabled?'On':'Off';button.setAttribute('aria-pressed',String(enabled));button.classList.toggle('is-active',enabled&&Boolean(example.stemsReady));}
  const popup=app.querySelector('#transcribe-measure-panel');popup.hidden=!example.measureOpen;popup.dataset.guideVisible=String(Boolean(example.measureOpen));
  app.querySelector('#transcribe-measures').setAttribute('aria-expanded',String(Boolean(example.measureOpen)));
  if(!example.measureOpen)app.querySelector('#transcribe-go-measure').value='';
  const gain=example.eqGain||0,graph=app.querySelector('#transcribe-eq-graph');
  const band=graph.querySelectorAll('g.eq-point')[1];band.setAttribute('transform',`translate(595.5143714486105 ${438-gain*14})`);
  const curve=graph.querySelector('path[fill="none"]');
  curve.setAttribute('d',Array.from({length:100},(_,i)=>{const x=30+i/99*1304;return `${i?'L':'M'}${x},${438-gain*14*Math.exp(-.5*((x-595.5143714486105)/100)**2)}`;}).join(' '));
  for(let i=1;i<=4;i++){
    app.querySelector(`[aria-label="Band ${i} frequency"]`).value=[100,400,1600,6400][i-1];
    app.querySelector(`[aria-label="Band ${i} gain"]`).value=i===2?gain:0;
    app.querySelector(`[aria-label="Band ${i} Q"]`).value=1;
  }
}
