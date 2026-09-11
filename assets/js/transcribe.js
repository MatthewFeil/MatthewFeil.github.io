(() => {
  const app = document.querySelector('[data-transcribe-app]');

  if (!app) {
    return;
  }

  const scriptUrl = document.currentScript?.src || `${window.location.origin}/assets/js/transcribe.js`;

  const elements = {
    workspace: document.getElementById('transcribe-workspace'),
    file: document.getElementById('transcribe-file'),
    fileName: document.getElementById('transcribe-file-name'),
    localStatus: document.getElementById('transcribe-local-status'),
    audio: document.getElementById('transcribe-audio'),
    speedButtons: [...document.querySelectorAll('[data-speed]')],
    customSpeedToggle: document.getElementById('transcribe-custom-speed-toggle'),
    customSpeedInput: document.getElementById('transcribe-custom-speed-input'),
    pitchLock: document.getElementById('transcribe-pitch-lock'),
    semitones: document.getElementById('transcribe-semitones'),
    semitonesNumber: document.getElementById('transcribe-semitones-number'),
    cents: document.getElementById('transcribe-cents'),
    centsNumber: document.getElementById('transcribe-cents-number'),
    loopBottom: document.getElementById('transcribe-loop-bottom'),
    channel: document.getElementById('transcribe-channel'),
    highpass: document.getElementById('transcribe-highpass'),
    lowpass: document.getElementById('transcribe-lowpass'),
    noteTolerance: document.getElementById('transcribe-note-tolerance'),
    spectrumScale: document.getElementById('transcribe-spectrum-scale'),
    overviewNavigator: document.getElementById('transcribe-overview-navigator'),
    overview: document.getElementById('transcribe-overview'),
    waveform: document.getElementById('transcribe-waveform'),
    empty: document.getElementById('transcribe-empty'),
    selectionStatus: document.getElementById('transcribe-selection-status'),
    audioFormat: document.getElementById('transcribe-audio-format'),
    analysis: document.getElementById('transcribe-analysis'),
    analysisGrid: document.getElementById('transcribe-analysis-grid'),
    analysisProgress: document.getElementById('transcribe-analysis-progress'),
    keyboard: document.getElementById('transcribe-keyboard'),
    spectrogram: document.getElementById('transcribe-spectrogram'),
    frequencyReadout: document.getElementById('transcribe-frequency-readout'),
    pitchHz: document.getElementById('transcribe-pitch-hz'),
    pitchNote: document.getElementById('transcribe-pitch-note'),
    pitchCents: document.getElementById('transcribe-pitch-cents'),
    start: document.getElementById('transcribe-start'),
    rewind: document.getElementById('transcribe-rewind'),
    play: document.getElementById('transcribe-play'),
    forward: document.getElementById('transcribe-forward'),
    seek: document.getElementById('transcribe-seek'),
    timecode: document.getElementById('transcribe-timecode'),
    timeRemaining: document.getElementById('transcribe-time-remaining'),
    volume: document.getElementById('transcribe-volume'),
    zoom: document.getElementById('transcribe-zoom'),
    viewButtons: [...document.querySelectorAll('[data-view-mode]')]
  };

  const state = {
    fileUrl: null,
    audioBuffer: null,
    duration: 0,
    peaks: null,
    zoom: 16,
    viewStart: 0,
    loopStart: null,
    loopEnd: null,
    loopEnabled: false,
    dragging: null,
    dragOriginX: 0,
    overviewDrag: null,
    analysisId: 0,
    analysisInFlight: false,
    pendingSpectrumTime: null,
    lastSpectrumTime: null,
    spectrogram: null,
    spectrumCursor: null,
    likelyNotes: [],
    spectrumScrollInitialized: false,
    spectrumScrollProgress: 0.25,
    animationFrame: null,
    audioContext: null,
    mediaSource: null,
    highpassNode: null,
    lowpassNode: null,
    midNode: null,
    pitchNode: null,
    splitterNode: null,
    leftGain: null,
    rightGain: null,
    mergerNode: null,
    outputGain: null
  };

  let marks = null;
  marks = new TranscribeMarks.Marks({
    duration: () => state.duration,
    current: () => elements.audio.currentTime,
    x: (time, width) => timeToX(time, width),
    time: (x, width) => xToTime(x, width),
    seek: (time) => seekBy(time - elements.audio.currentTime),
    loop: (start, end) => {
      setSelection(start, end);
      state.loopEnabled = true;
      elements.audio.currentTime = start;
      normalizeViewStart(start);
      updateLoopControls();
      renderAll();
    },
    render: () => { if (marks) { marks.draw(); drawOverview(); } }
  });

  const worker = new Worker(new URL('transcribe-analysis-worker.js?v=20260908-6', scriptUrl));
  const colors = {
    background: '#000000',
    text: '#f6f6f6',
    muted: '#a7a7a7',
    border: 'rgba(246,246,246,0.24)',
    borderStrong: 'rgba(246,246,246,0.55)',
    accent: '#ff343d',
    accentSoft: 'rgba(255,52,61,0.13)'
  };
  const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
  const minimumSpectrumMidi = 24;
  const maximumSpectrumMidi = 96;
  const spectrumWhiteKeyCount = 42;
  const spectrumWindowSeconds = 0.4;
  const spectrumUpdateIntervalSeconds = 0.1;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function setPlaybackSpeed(speed) {
    elements.audio.playbackRate = speed;
    let presetIsActive = false;
    elements.speedButtons.forEach((button) => {
      const active = Number(button.dataset.speed) === speed;
      presetIsActive ||= active;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    elements.customSpeedToggle.classList.toggle('is-active', !presetIsActive);
    elements.customSpeedToggle.textContent = presetIsActive ? 'Other' : `${Math.round(speed * 100)}%`;
    elements.customSpeedInput.value = String(Math.round(speed * 100));
  }

  function toggleCustomSpeedControl() {
    elements.customSpeedToggle.setAttribute('aria-expanded', 'true');
    elements.customSpeedToggle.hidden = true;
    elements.customSpeedInput.hidden = false;
    elements.customSpeedInput.focus();
    elements.customSpeedInput.select();
  }

  function closeCustomSpeedControl() {
    elements.customSpeedInput.hidden = true;
    elements.customSpeedToggle.hidden = false;
    elements.customSpeedToggle.setAttribute('aria-expanded', 'false');
  }

  function applyCustomSpeed() {
    if (elements.customSpeedInput.value === '') {
      elements.customSpeedInput.value = String(Math.round(elements.audio.playbackRate * 100));
      closeCustomSpeedControl();
      return;
    }
    const percent = clamp(Number(elements.customSpeedInput.value), 25, 200);
    if (!Number.isFinite(percent)) return;
    setPlaybackSpeed(percent / 100);
    elements.customSpeedInput.value = String(percent);
    closeCustomSpeedControl();
  }

  function pitchShiftCents() {
    return Number(elements.semitones.value) * 100 + Number(elements.cents.value);
  }

  function updatePitchShift() {
    const semitones = Number(elements.semitones.value);
    const cents = Number(elements.cents.value);
    elements.semitones.setAttribute('aria-valuetext', `${semitones > 0 ? '+' : ''}${semitones} semitone${Math.abs(semitones) === 1 ? '' : 's'}`);
    elements.cents.setAttribute('aria-valuetext', `${cents > 0 ? '+' : ''}${cents} cent${Math.abs(cents) === 1 ? '' : 's'}`);
    const pitchFactor = state.pitchNode?.parameters.get('pitchFactor');
    if (pitchFactor && state.audioContext) {
      pitchFactor.setValueAtTime(2 ** (pitchShiftCents() / 1200), state.audioContext.currentTime);
    }
    if (state.audioBuffer) {
      state.analysisId += 1;
      state.analysisInFlight = false;
      state.pendingSpectrumTime = null;
      state.lastSpectrumTime = null;
      state.spectrogram = null;
      state.spectrumCursor = null;
      state.likelyNotes = [];
      resetPitchReadout();
      requestSpectrumAt(elements.audio.currentTime, true);
    }
  }

  function connectPitchControl(range, number) {
    range.addEventListener('input', () => {
      number.value = range.value;
      updatePitchShift();
    });
    const commitNumber = () => {
      if (number.value === '') return;
      const value = Math.round(clamp(Number(number.value), Number(number.min), Number(number.max)));
      number.value = String(value);
      range.value = String(value);
      updatePitchShift();
    };
    number.addEventListener('input', commitNumber);
    number.addEventListener('change', commitNumber);
  }

  function isBlackKey(midi) {
    return blackPitchClasses.has(((Math.floor(midi) % 12) + 12) % 12);
  }

  function whiteKeysBefore(midi) {
    let count = 0;
    for (let note = minimumSpectrumMidi; note < midi; note += 1) {
      if (!isBlackKey(note)) count += 1;
    }
    return count;
  }

  function midiCenterToKeyboardX(midi, width) {
    const boundedMidi = clamp(midi, minimumSpectrumMidi, maximumSpectrumMidi - 1);
    const lowerMidi = Math.floor(boundedMidi);
    const fraction = boundedMidi - lowerMidi;
    const keyWidth = width / spectrumWhiteKeyCount;
    const centerForNote = (note) => {
      const whiteIndex = whiteKeysBefore(note);
      return (whiteIndex + (isBlackKey(note) ? 0 : 0.5)) * keyWidth;
    };
    const lowerX = centerForNote(lowerMidi);
    const upperX = lowerMidi < maximumSpectrumMidi - 1 ? centerForNote(lowerMidi + 1) : width;
    return lowerX + (upperX - lowerX) * fraction;
  }

  function keyboardXToMidi(x, width) {
    const boundedX = clamp(x, 0, width);
    let previousMidi = minimumSpectrumMidi;
    let previousX = midiCenterToKeyboardX(previousMidi, width);
    for (let midi = minimumSpectrumMidi + 1; midi < maximumSpectrumMidi; midi += 1) {
      const nextX = midiCenterToKeyboardX(midi, width);
      if (boundedX <= nextX) {
        return previousMidi + clamp((boundedX - previousX) / Math.max(1, nextX - previousX), 0, 1);
      }
      previousMidi = midi;
      previousX = nextX;
    }
    return maximumSpectrumMidi - 1;
  }

  function configureCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width: rect.width, height: rect.height, ratio };
  }

  function formatTime(seconds, includeMilliseconds = true) {
    if (!Number.isFinite(seconds)) {
      return includeMilliseconds ? '00:00.000' : '0:00';
    }

    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const wholeSeconds = Math.floor(safeSeconds % 60);
    const milliseconds = Math.floor((safeSeconds % 1) * 1000);
    return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}${includeMilliseconds ? `.${String(milliseconds).padStart(3, '0')}` : ''}`;
  }

  function midiToFrequency(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
  }

  function midiToName(midi) {
    const rounded = Math.round(midi);
    return `${noteNames[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
  }

  function updateTimecode() {
    const formatPlaybackTime = (seconds) => {
      const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
      const minutes = Math.floor(safeSeconds / 60);
      const wholeSeconds = Math.floor(safeSeconds % 60);
      const hundredths = Math.floor((safeSeconds % 1) * 100);
      return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
    };
    elements.seek.max = String(state.duration);
    elements.seek.value = String(elements.audio.currentTime);
    elements.seek.setAttribute('aria-valuetext', `${formatPlaybackTime(elements.audio.currentTime)} of ${formatPlaybackTime(state.duration)}`);
    elements.timecode.textContent = formatTime(elements.audio.currentTime, false);
    elements.timeRemaining.textContent = `-${formatTime(Math.ceil(Math.max(0, state.duration - elements.audio.currentTime)), false)}`;
  }

  function viewDuration() {
    return state.duration ? state.duration / state.zoom : 0;
  }

  function normalizeViewStart(centerTime = elements.audio.currentTime || 0) {
    const visibleDuration = viewDuration();
    state.viewStart = clamp(centerTime - visibleDuration / 2, 0, Math.max(0, state.duration - visibleDuration));
  }

  function timeToX(time, width) {
    const visibleDuration = viewDuration();
    return visibleDuration ? ((time - state.viewStart) / visibleDuration) * width : 0;
  }

  function xToTime(x, width) {
    return clamp(state.viewStart + (x / Math.max(1, width)) * viewDuration(), 0, state.duration);
  }

  function updateTimelineScrollA11y() {
    const visibleEnd = Math.min(state.duration, state.viewStart + viewDuration());
    elements.overviewNavigator.setAttribute('aria-valuemax', String(Math.max(0, state.duration - viewDuration())));
    elements.overviewNavigator.setAttribute('aria-valuenow', String(Math.max(0, state.viewStart)));
    elements.overviewNavigator.setAttribute('aria-valuetext', `${formatTime(state.viewStart)} to ${formatTime(visibleEnd)}`);
  }

  function syncTimelineScroll() {
    updateTimelineScrollA11y();
  }

  function setTimelineViewStart(nextStart) {
    state.viewStart = clamp(nextStart, 0, Math.max(0, state.duration - viewDuration()));
    updateTimelineScrollA11y();
    drawOverview();
    drawWaveform();
  }

  function panTimelineByPixels(delta, width) {
    if (!state.duration || state.zoom <= 1) return;
    setTimelineViewStart(state.viewStart + (delta / Math.max(1, width)) * viewDuration());
  }

  function drawPeakRange(context, peaks, bucketStart, bucketEnd, x, width, centerY, amplitude, color) {
    if (!peaks || bucketEnd <= bucketStart) {
      return;
    }

    const visibleBuckets = bucketEnd - bucketStart;
    const pixelCount = Math.max(1, Math.floor(width));
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();

    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const firstBucket = Math.floor(bucketStart + (pixel / pixelCount) * visibleBuckets);
      const lastBucket = Math.max(firstBucket + 1, Math.ceil(bucketStart + ((pixel + 1) / pixelCount) * visibleBuckets));
      let minimum = 1;
      let maximum = -1;

      for (let bucket = firstBucket; bucket < lastBucket && bucket * 2 + 1 < peaks.length; bucket += 1) {
        minimum = Math.min(minimum, peaks[bucket * 2]);
        maximum = Math.max(maximum, peaks[bucket * 2 + 1]);
      }

      const drawX = x + pixel + 0.5;
      context.moveTo(drawX, centerY + minimum * amplitude);
      context.lineTo(drawX, centerY + maximum * amplitude);
    }

    context.stroke();
  }

  function drawOverview() {
    const { context, width, height } = configureCanvas(elements.overview);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    if (!state.peaks || !state.duration) {
      return;
    }

    context.fillStyle = colors.muted;
    context.font = '700 10px "Familjen Grotesk", Arial, sans-serif';
    context.textBaseline = 'top';

    const tickCount = Math.max(2, Math.floor(width / 120));
    for (let tick = 0; tick <= tickCount; tick += 1) {
      const x = (tick / tickCount) * width;
      const time = (tick / tickCount) * state.duration;
      context.fillText(formatTime(time, false), clamp(x + 6, 4, width - 38), 5);
    }

    drawPeakRange(context, state.peaks, 0, state.peaks.length / 2, 0, width, height * 0.64, height * 0.23, colors.text);

    marks?.overview(context, width, height, state.duration);
    const visibleDuration = viewDuration();
    const viewportX = (state.viewStart / state.duration) * width;
    const viewportWidth = (visibleDuration / state.duration) * width;
    context.fillStyle = 'rgba(246,246,246,0.09)';
    context.fillRect(viewportX, 20, viewportWidth, height - 23);
    context.strokeStyle = colors.accent;
    context.lineWidth = 1;
    context.strokeRect(viewportX + 0.5, 20.5, Math.max(1, viewportWidth - 1), height - 24);

    if (state.loopStart !== null && state.loopEnd !== null) {
      const startX = (state.loopStart / state.duration) * width;
      const endX = (state.loopEnd / state.duration) * width;
      context.fillStyle = colors.accentSoft;
      context.fillRect(startX, 20, endX - startX, height - 23);
    }
  }

  function drawWaveform() {
    marks?.draw();
    const { context, width, height } = configureCanvas(elements.waveform);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    if (!state.peaks || !state.duration) {
      return;
    }

    const headerHeight = 52;
    const channelGap = 10;
    const channelHeight = (height - headerHeight - channelGap) / 2;
    const centerTop = headerHeight + channelHeight / 2;
    const centerBottom = headerHeight + channelHeight + channelGap + channelHeight / 2;
    const visibleDuration = viewDuration();

    context.strokeStyle = colors.border;
    context.fillStyle = colors.muted;
    context.font = '700 11px "Familjen Grotesk", Arial, sans-serif';
    context.textBaseline = 'top';
    const idealTickSeconds = visibleDuration / Math.max(3, Math.floor(width / 100));
    const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const tickStep = steps.find((step) => step >= idealTickSeconds) || 600;
    const firstTick = Math.ceil(state.viewStart / tickStep) * tickStep;

    for (let time = firstTick; time <= state.viewStart + visibleDuration; time += tickStep) {
      const x = timeToX(time, width);
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, height);
      context.stroke();
      context.fillText(formatTime(time, false), x + 5, 6);
    }

    if (state.loopStart !== null && state.loopEnd !== null) {
      const startX = timeToX(state.loopStart, width);
      const endX = timeToX(state.loopEnd, width);
      context.fillStyle = colors.accentSoft;
      context.fillRect(startX, 0, endX - startX, height);
      context.strokeStyle = colors.accent;
      context.lineWidth = 1;
      context.strokeRect(startX + 0.5, 30.5, Math.max(1, endX - startX - 1), height - 31);
      context.fillStyle = colors.accent;
      context.fillRect(startX - 4, 30, 8, 20);
      context.fillRect(endX - 4, 30, 8, 20);
    }

    const peakCount = state.peaks.length / 2;
    const bucketStart = (state.viewStart / state.duration) * peakCount;
    const bucketEnd = ((state.viewStart + visibleDuration) / state.duration) * peakCount;
    drawPeakRange(context, state.peaks, bucketStart, bucketEnd, 0, width, centerTop, channelHeight * 0.46, colors.text);
    drawPeakRange(context, state.peaks, bucketStart, bucketEnd, 0, width, centerBottom, channelHeight * 0.46, colors.text);

    const playheadX = timeToX(elements.audio.currentTime, width);
    if (playheadX >= 0 && playheadX <= width) {
      context.strokeStyle = colors.accent;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, height);
      context.stroke();
    }
  }

  function drawKeyboard(cursorMidi = null) {
    const { context, width, height } = configureCanvas(elements.keyboard);
    const whiteKeyWidth = width / spectrumWhiteKeyCount;
    const blackKeyWidth = whiteKeyWidth * 0.62;
    const likelyNotesByMidi = new Map(state.likelyNotes.map((note) => [note.midi, note]));
    const likelyNoteLabel = state.likelyNotes
      .map((note) => `${midiToName(note.midi)} ${Math.round(note.confidence * 100)} percent`)
      .join(', ');
    elements.keyboard.setAttribute('aria-label', likelyNoteLabel
      ? `Horizontal piano keyboard from C1 to B6. Relative note strengths: ${likelyNoteLabel}.`
      : 'Horizontal piano keyboard from C1 to B6.');

    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    for (let midi = minimumSpectrumMidi; midi < maximumSpectrumMidi; midi += 1) {
      if (isBlackKey(midi)) continue;
      const whiteIndex = whiteKeysBefore(midi);
      const x = whiteIndex * whiteKeyWidth;
      const likelyNote = likelyNotesByMidi.get(midi);
      context.fillStyle = colors.text;
      context.fillRect(x, 0, Math.ceil(whiteKeyWidth) + 1, height);
      if (likelyNote) {
        context.save();
        context.globalAlpha = 0.1 + likelyNote.confidence ** 3 * 0.9;
        context.fillStyle = colors.accent;
        context.fillRect(x, 0, Math.ceil(whiteKeyWidth) + 1, height);
        context.restore();
      }
      context.strokeStyle = '#292929';
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, 0.5, Math.max(1, whiteKeyWidth), height - 1);

      if (midi % 12 === 0) {
        context.fillStyle = '#171717';
        context.font = '700 11px "Familjen Grotesk", Arial, sans-serif';
        context.textBaseline = 'bottom';
        context.fillText(`C${Math.floor(midi / 12) - 1}`, x + 5, height - 5);
      }
    }

    for (let midi = minimumSpectrumMidi; midi < maximumSpectrumMidi; midi += 1) {
      if (!isBlackKey(midi)) continue;
      const boundaryX = whiteKeysBefore(midi) * whiteKeyWidth;
      const likelyNote = likelyNotesByMidi.get(midi);
      context.fillStyle = '#090909';
      context.fillRect(boundaryX - blackKeyWidth / 2, 0, blackKeyWidth, height * 0.64);
      if (likelyNote) {
        context.save();
        context.globalAlpha = 0.18 + likelyNote.confidence ** 3 * 0.82;
        context.fillStyle = colors.accent;
        context.fillRect(boundaryX - blackKeyWidth / 2, 0, blackKeyWidth, height * 0.64);
        context.restore();
      }
      context.strokeStyle = '#000000';
      context.strokeRect(boundaryX - blackKeyWidth / 2 + 0.5, 0.5, blackKeyWidth - 1, height * 0.64);
    }

    if (cursorMidi !== null) {
      const x = midiCenterToKeyboardX(cursorMidi, width);
      context.strokeStyle = colors.accent;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  function resetPitchReadout() {
    elements.pitchHz.textContent = '— Hz';
    elements.pitchNote.textContent = '—';
    elements.pitchCents.textContent = '—¢';
  }

  function updatePitchReadout(time, continuousMidi) {
    const nearestMidi = Math.round(continuousMidi);
    const frequency = midiToFrequency(continuousMidi);
    const cents = Math.round((continuousMidi - nearestMidi) * 100);
    state.spectrumCursor = { time, midi: continuousMidi };
    elements.pitchHz.textContent = `${frequency.toFixed(1)} Hz`;
    elements.pitchNote.textContent = midiToName(nearestMidi);
    elements.pitchCents.textContent = `${cents >= 0 ? '+' : ''}${cents}¢`;
  }

  function setDominantPitchCursor(fraction = 0.5) {
    if (!state.spectrogram || !state.likelyNotes.length) {
      resetPitchReadout();
      return;
    }
    const { start, end } = state.spectrogram;
    updatePitchReadout(start + fraction * (end - start), state.likelyNotes[0].preciseMidi);
  }

  const chordTracker = new TranscribeChords.Tracker();
  const chordReadout = document.getElementById('transcribe-chords');
  const chordToggle = document.getElementById('transcribe-chords-toggle');
  let chordsEnabled = false;
  chordToggle.addEventListener('click', () => {
    chordsEnabled = !chordsEnabled;
    chordToggle.setAttribute('aria-pressed', String(chordsEnabled));
    chordToggle.classList.toggle('is-active', chordsEnabled);
    chordToggle.querySelector('strong').textContent = chordsEnabled ? 'On' : 'Off';
    chordReadout.hidden = !chordsEnabled;
    chordTracker.reset();
    chordReadout.replaceChildren();
    if (state.spectrogram) state.spectrogram.noteTolerance = null;
    drawSpectrogram();
  });
  function renderChords(guesses) {
    chordReadout.replaceChildren(...guesses.map((guess, index) => {
      const node = document.createElement(index === 0 ? 'strong' : 'span');
      node.textContent = guess;
      return node;
    }));
  }

  function detectLikelyNotes(profile, binsPerSemitone, minimumMidi, chordEvidence = false) {
    const maximum = Math.max(...profile);
    if (maximum < 0.00002) return [];
    const tolerance = Number(elements.noteTolerance.value);
    const peaks = [];
    for (let row = 1; row < profile.length - 1; row += 1) {
      const value = profile[row];
      if (value <= profile[row - 1] || value < profile[row + 1]) continue;
      const neighborhood = Array.from(profile.slice(Math.max(0, row - 48), row + 49)).sort((a, b) => a - b);
      const floor = neighborhood[Math.floor(neighborhood.length / 4)];
      if (value < Math.max(0.00002, maximum * (0.015 + tolerance * 0.04), floor * 3)) continue;
      const preciseMidi = minimumMidi + row / binsPerSemitone;
      peaks.push({ preciseMidi, frequency: midiToFrequency(preciseMidi), value });
    }
    // Score families jointly. Shared partials retain a small residual, so an
    // independently supported upper note can survive without lighting every overtone.
    const candidates = new Map();
    for (const peak of peaks) {
      for (let divisor = 1; divisor <= 6; divisor += 1) {
        const preciseMidi = peak.preciseMidi - 12 * Math.log2(divisor);
        const midi = Math.round(preciseMidi);
        if (midi < minimumSpectrumMidi || midi >= maximumSpectrumMidi) continue;
        const frequency = midiToFrequency(preciseMidi);
        const matches = peaks.map((partial, index) => {
          const harmonic = Math.round(partial.frequency / frequency);
          const cents = Math.abs(1200 * Math.log2(partial.frequency / (frequency * harmonic)));
          return harmonic >= 1 && harmonic <= 10 && cents < 28 ? { index, harmonic } : null;
        }).filter(Boolean);
        const fundamental = matches.some((match) => match.harmonic === 1);
        if (!fundamental && (matches.length < 3 || !matches.some((match) => match.harmonic % 2))) continue;
        // Missing roots need a coherent descending run, otherwise a major
        // chord can masquerade as the partials of a nonexistent bass note.
        if (!fundamental) {
          const amplitude = (harmonic) => {
            const match = matches.find((item) => item.harmonic === harmonic);
            return match ? peaks[match.index].value : 0;
          };
          if (!amplitude(4) || amplitude(2) < amplitude(3) * 1.15 || amplitude(3) < amplitude(4) * 1.15) continue;
        }
        const score = matches.reduce((sum, match) => sum + peaks[match.index].value / Math.sqrt(match.harmonic), 0);
        if (score > (candidates.get(midi)?.score || 0)) candidates.set(midi, { midi, preciseMidi, matches, score, fundamental });
      }
    }
    const residual = peaks.map((peak) => peak.value);
    const selected = [];
    while (selected.length < (chordEvidence ? 24 : 8) && candidates.size) {
      let best = null;
      for (const candidate of candidates.values()) {
        const score = candidate.matches.reduce((sum, match) => sum + residual[match.index] / Math.sqrt(match.harmonic), 0);
        if (!best || score > best.score) best = { ...candidate, score };
      }
      if (!best || best.score < maximum * (chordEvidence ? 0.12 : 0.12 + tolerance * 0.45)) break;
      selected.push(best);
      candidates.delete(best.midi);
      const octave = candidates.get(best.midi + 12);
      const independentOctave = octave?.fundamental
        && octave.matches.some((match) => match.harmonic === 3)
        && octave.matches.some((match) => match.harmonic === 5)
        && !best.matches.some((match) => match.harmonic === 3 || match.harmonic === 5);
      for (const match of best.matches) {
        if (independentOctave && match.harmonic % 2 === 0) continue;
        residual[match.index] *= 0.08;
      }
    }
    return selected.map((note) => ({ ...note, confidence: Math.min(1, note.score / selected[0].score) }));
  }

  function drawSpectrogram() {
    const { context, width, height } = configureCanvas(elements.spectrogram);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    if (!state.spectrogram) {
      state.likelyNotes = [];
      chordTracker.reset();
      renderChords([]);
      context.fillStyle = colors.muted;
      context.font = '700 12px "Familjen Grotesk", Arial, sans-serif';
      context.textBaseline = 'middle';
      context.fillText(state.audioBuffer ? 'Spectrum follows the playhead' : 'Open audio to inspect its frequency content', 16, height / 2);
      drawKeyboard();
      return;
    }

    const { data, frames, rows, binsPerSemitone, minimumMidi, maximumMidi } = state.spectrogram;
    const profile = new Float32Array(rows);
    for (let row = 0; row < rows; row += 1) {
      let sum = 0;
      for (let frame = 0; frame < frames; frame += 1) {
        const value = data[frame * rows + row];
        sum += value * value;
      }
      profile[row] = Math.sqrt(sum / frames);
    }
    const tolerance = elements.noteTolerance.value;
    if (state.spectrogram.noteTolerance !== tolerance) {
      const chordNotes = detectLikelyNotes(profile, binsPerSemitone, minimumMidi, true);
      const detected = chordNotes.filter(note => note.score >= Math.max(...profile) * (0.12 + Number(tolerance) * 0.45)).slice(0, 8);
      const history = state.spectrumHistory;
      const elapsed = state.spectrogram.center - (history?.center ?? -Infinity);
      const continuous = !elements.audio.paused && elapsed > 0 && elapsed < 0.3 && history?.tolerance === tolerance;
      if (chordsEnabled) renderChords(chordTracker.update(chordNotes, state.spectrogram.center, continuous));
      const peak = Math.max(...profile);
      const notes = continuous && peak >= 0.00002
        ? detected.filter((note) => history.detected.some((previous) => previous.midi === note.midi))
        : detected;
      state.spectrogram.notes = notes;
      state.spectrogram.reference = continuous
        ? Math.max(0.0002, peak, history.reference * Math.exp(-elapsed / 0.4))
        : Math.max(0.0002, peak);
      state.spectrogram.noteTolerance = tolerance;
      state.spectrumHistory = { center: state.spectrogram.center, detected, tolerance, reference: state.spectrogram.reference };
    }
    state.likelyNotes = state.spectrogram.notes;
    const reference = state.spectrogram.reference;

    context.strokeStyle = colors.border;
    context.lineWidth = 1;
    for (let level = 0; level <= 4; level += 1) {
      const y = (level / 4) * height;
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(width, y + 0.5);
      context.stroke();
    }
    for (let midi = minimumMidi; midi <= maximumMidi; midi += 12) {
      const x = midiCenterToKeyboardX(midi, width);
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, height);
      context.stroke();
    }

    context.beginPath();
    profile.forEach((value, row) => {
      const x = midiCenterToKeyboardX(minimumMidi + row / binsPerSemitone, width);
      const amplitude = Math.min(1, value / reference);
      const level = elements.spectrumScale.value === 'db'
        ? clamp((20 * Math.log10(Math.max(amplitude, 1e-8)) + 62) / 62, 0, 1)
        : amplitude;
      const y = height - level * (height - 10) - 5;
      if (row === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = colors.text;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();

    if (state.spectrumCursor) {
      const cursorX = midiCenterToKeyboardX(state.spectrumCursor.midi, width);
      context.strokeStyle = colors.accent;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cursorX, 0);
      context.lineTo(cursorX, height);
      context.stroke();
      drawKeyboard(state.spectrumCursor.midi);
    } else {
      drawKeyboard();
    }
  }

  function renderAll() {
    syncTimelineScroll();
    drawOverview();
    drawWaveform();
    drawSpectrogram();
    updateTimecode();
  }

  function resizeCanvases() {
    const maximumScrollBeforeResize = Math.max(0, elements.analysisGrid.scrollWidth - elements.analysisGrid.clientWidth);
    if (state.spectrumScrollInitialized && maximumScrollBeforeResize) {
      state.spectrumScrollProgress = elements.analysisGrid.scrollLeft / maximumScrollBeforeResize;
    }
    renderAll();
    const maximumScroll = Math.max(0, elements.analysisGrid.scrollWidth - elements.analysisGrid.clientWidth);
    if (maximumScroll) {
      elements.analysisGrid.scrollLeft = maximumScroll * state.spectrumScrollProgress;
    }
    state.spectrumScrollInitialized = true;
    updateSpectrumScrollState();
  }

  function updateSpectrumScrollState() {
    const maximumScroll = Math.max(0, elements.analysisGrid.scrollWidth - elements.analysisGrid.clientWidth);
    state.spectrumScrollProgress = maximumScroll ? elements.analysisGrid.scrollLeft / maximumScroll : 0;
    elements.analysisGrid.dataset.scrollable = String(maximumScroll > 0);
    const contentWidth = Math.max(1, elements.analysisGrid.scrollWidth);
    const startMidi = keyboardXToMidi(elements.analysisGrid.scrollLeft, contentWidth);
    const endMidi = keyboardXToMidi(elements.analysisGrid.scrollLeft + elements.analysisGrid.clientWidth, contentWidth);
    const rangeLabel = `Pitch spectrum, visible range ${midiToName(Math.round(startMidi))} to ${midiToName(Math.round(endMidi))}.`;
    elements.analysisGrid.setAttribute('aria-label', maximumScroll ? `${rangeLabel} Scroll horizontally to inspect lower or higher octaves.` : rangeLabel);
  }

  function setControlsEnabled(enabled) {
    [
      elements.start,
      elements.rewind,
      elements.play,
      elements.forward,
      elements.volume,
      elements.seek,
      elements.zoom
    ].forEach((element) => {
      element.disabled = !enabled;
    });
    elements.loopBottom.disabled = !enabled || state.loopStart === null;
  }

  async function initializeAudioGraph(shouldResume = false) {
    if (state.audioContext) {
      if (shouldResume && state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContextClass();
    await state.audioContext.audioWorklet.addModule(new URL('transcribe-pitch-worklet.js?v=20260908-3', scriptUrl));
    state.mediaSource = state.audioContext.createMediaElementSource(elements.audio);
    state.highpassNode = state.audioContext.createBiquadFilter();
    state.highpassNode.type = 'highpass';
    state.lowpassNode = state.audioContext.createBiquadFilter();
    state.lowpassNode.type = 'lowpass';
    state.midNode = state.audioContext.createBiquadFilter();
    state.midNode.type = 'peaking';
    state.midNode.frequency.value = 1200;
    state.midNode.Q.value = 0.8;
    state.midNode.gain.value = 0;
    state.pitchNode = new AudioWorkletNode(state.audioContext, 'transcribe-pitch-processor', {
      parameterData: { pitchFactor: 2 ** (pitchShiftCents() / 1200) }
    });
    state.splitterNode = state.audioContext.createChannelSplitter(2);
    state.leftGain = state.audioContext.createGain();
    state.rightGain = state.audioContext.createGain();
    state.mergerNode = state.audioContext.createChannelMerger(2);
    state.outputGain = state.audioContext.createGain();

    state.mediaSource.connect(state.highpassNode);
    state.highpassNode.connect(state.lowpassNode);
    state.lowpassNode.connect(state.midNode);
    state.midNode.connect(state.pitchNode);
    state.pitchNode.connect(state.splitterNode);
    state.splitterNode.connect(state.leftGain, 0);
    state.splitterNode.connect(state.rightGain, 1);
    state.mergerNode.connect(state.outputGain);
    state.outputGain.connect(state.audioContext.destination);
    updateFilters();
    updateVolume();
    updatePitchShift();
    reconnectChannels();
    if (shouldResume && state.audioContext.state === 'suspended') {
      await state.audioContext.resume();
    }
  }

  function reconnectChannels() {
    if (!state.leftGain || !state.rightGain || !state.mergerNode) {
      return;
    }

    state.leftGain.disconnect();
    state.rightGain.disconnect();
    state.leftGain.gain.value = 1;
    state.rightGain.gain.value = 1;

    switch (elements.channel.value) {
      case 'left':
        state.leftGain.gain.value = 0.72;
        state.leftGain.connect(state.mergerNode, 0, 0);
        state.leftGain.connect(state.mergerNode, 0, 1);
        break;
      case 'right':
        state.rightGain.gain.value = 0.72;
        state.rightGain.connect(state.mergerNode, 0, 0);
        state.rightGain.connect(state.mergerNode, 0, 1);
        break;
      case 'mono':
        state.leftGain.gain.value = 0.5;
        state.rightGain.gain.value = 0.5;
        state.leftGain.connect(state.mergerNode, 0, 0);
        state.leftGain.connect(state.mergerNode, 0, 1);
        state.rightGain.connect(state.mergerNode, 0, 0);
        state.rightGain.connect(state.mergerNode, 0, 1);
        break;
      default:
        state.leftGain.connect(state.mergerNode, 0, 0);
        state.rightGain.connect(state.mergerNode, 0, 1);
    }
  }

  function updateFilters() {
    if (!state.highpassNode || !state.lowpassNode) {
      return;
    }
    state.highpassNode.frequency.setTargetAtTime(Number(elements.highpass.value), state.audioContext.currentTime, 0.01);
    state.lowpassNode.frequency.setTargetAtTime(Number(elements.lowpass.value), state.audioContext.currentTime, 0.01);
  }

  function updateVolume() {
    if (state.outputGain) {
      state.outputGain.gain.setTargetAtTime(Number(elements.volume.value), state.audioContext.currentTime, 0.01);
    } else {
      elements.audio.volume = Number(elements.volume.value);
    }
  }

  function updateLoopControls() {
    const hasLoop = state.loopStart !== null && state.loopEnd !== null;
    state.loopEnabled = Boolean(state.loopEnabled && hasLoop);
    [elements.loopBottom].forEach((button) => {
      button.classList.toggle('is-active', state.loopEnabled);
      button.setAttribute('aria-pressed', String(state.loopEnabled));
    });
    elements.loopBottom.disabled = !state.duration || !hasLoop;
  }

  function setLoopEnabled(enabled) {
    state.loopEnabled = enabled;
    updateLoopControls();
  }

  function toggleLoop() {
    if (state.loopStart === null || state.loopEnd === null) {
      return;
    }
    setLoopEnabled(!state.loopEnabled);
  }

  async function togglePlayback() {
    if (!state.duration) {
      return;
    }

    await initializeAudioGraph(true);
    if (elements.audio.paused) {
      if (state.loopEnabled && state.loopEnd !== null && elements.audio.currentTime >= state.loopEnd) {
        elements.audio.currentTime = state.loopStart;
      }
      await elements.audio.play();
    } else {
      elements.audio.pause();
    }
  }

  function seekBy(seconds) {
    if (!state.duration) {
      return;
    }
    elements.audio.currentTime = clamp(elements.audio.currentTime + seconds, 0, state.duration);
    if (elements.audio.currentTime < state.viewStart || elements.audio.currentTime > state.viewStart + viewDuration()) {
      normalizeViewStart();
    }
    renderAll();
  }

  function setZoom(nextZoom) {
    if (!state.duration) {
      return;
    }
    state.zoom = clamp(nextZoom, 1, 32);
    normalizeViewStart();
    elements.zoom.setAttribute('aria-valuetext', `${Math.round(state.zoom * 100)}%`);
    renderAll();
  }

  function requestSpectrumAt(time, force = false) {
    if (force) { state.spectrumHistory = null; chordTracker.reset(); }
    if (!state.audioBuffer) {
      state.spectrogram = null;
      state.spectrumCursor = null;
      state.likelyNotes = [];
      resetPitchReadout();
      elements.frequencyReadout.textContent = 'Open audio to inspect its frequency content';
      drawSpectrogram();
      return;
    }

    const center = clamp(time, 0, state.duration);
    if (!force && state.lastSpectrumTime !== null && Math.abs(center - state.lastSpectrumTime) < spectrumUpdateIntervalSeconds) {
      return;
    }
    if (state.analysisInFlight) {
      state.pendingSpectrumTime = center;
      return;
    }

    const windowDuration = Math.min(spectrumWindowSeconds, state.duration);
    const start = clamp(center - windowDuration / 2, 0, Math.max(0, state.duration - windowDuration));
    const end = Math.min(state.duration, start + windowDuration);
    state.analysisId += 1;
    state.analysisInFlight = true;
    state.lastSpectrumTime = center;
    if (!state.spectrogram) {
      elements.analysisProgress.hidden = false;
      elements.frequencyReadout.textContent = `${formatTime(center)} · analyzing around playhead`;
    }
    worker.postMessage({
      type: 'analyze',
      id: state.analysisId,
      center,
      start,
      end,
      pitchShiftCents: pitchShiftCents(),
      frames: 1
    });
  }

  function setSelection(start, end, shouldAnalyze = true) {
    state.loopStart = clamp(Math.min(start, end), 0, state.duration);
    state.loopEnd = clamp(Math.max(start, end), 0, state.duration);
    const duration = state.loopEnd - state.loopStart;

    if (duration < 0.04) {
      state.loopStart = null;
      state.loopEnd = null;
      state.loopEnabled = false;
      elements.selectionStatus.textContent = '';
    } else {
      elements.selectionStatus.textContent = `A ${formatTime(state.loopStart)} · B ${formatTime(state.loopEnd)} · ${duration.toFixed(3)} seconds`;
    }

    updateLoopControls();
    renderAll();
    if (shouldAnalyze) {
      requestSpectrumAt(elements.audio.currentTime, true);
    }
  }

  const configActions = document.getElementById('transcribe-config-actions');
  const configFile = document.getElementById('transcribe-config-file');
  const configStatus = document.getElementById('transcribe-config-status');
  const configMessage = document.getElementById('transcribe-config-message');
  let configStatusTimer;
  function showConfigStatus(message) {
    clearTimeout(configStatusTimer);
    configMessage.textContent = message;
    configStatus.hidden = !message;
    if (message) configStatusTimer = setTimeout(() => showConfigStatus(''), 4500);
  }
  document.getElementById('transcribe-config-dismiss').addEventListener('click', () => showConfigStatus(''));
  const configFields = ['channel', 'highpass', 'lowpass', 'noteTolerance', 'spectrumScale', 'semitones', 'cents', 'volume'];


  // Store the original audio only when a recording changes; config writes stay small.
  let sessionFile = null, sessionRevision = 0, sessionAudioSaved = false;
  let savedSessionJSON = null, sessionSaving = false, retrySaveAfter = 0;
  function sessionStorage(mode, operation) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('transcribe-session', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('session');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('Storage blocked'));
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction('session', mode);
          const result = operation(tx.objectStore('session'));
          tx.oncomplete = () => { db.close(); resolve(result?.result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        } catch (error) { db.close(); reject(error); }
      };
    });
  }
  async function saveSession() {
    if (!sessionFile || !marks.identity || sessionSaving || Date.now() < retrySaveAfter) return;
    const config = captureConfig(), json = JSON.stringify(config);
    if (json === savedSessionJSON) return;
    const revision = sessionRevision, file = sessionFile, includeAudio = !sessionAudioSaved;
    sessionSaving = true;
    try {
      await sessionStorage('readwrite', store => {
        if (includeAudio) store.put(file, 'audio');
        store.put(config, 'config');
      });
      if (revision === sessionRevision) {
        sessionAudioSaved = true;
        savedSessionJSON = json;
      }
    } catch {
      if (revision === sessionRevision) {
        retrySaveAfter = Date.now() + 5000;
        showConfigStatus('Not saved · export config');
      }
    } finally {
      sessionSaving = false;
      // A change during a write must be committed before showing the final saved state.
      if (sessionFile && JSON.stringify(captureConfig()) !== savedSessionJSON && Date.now() >= retrySaveAfter) saveSession();
    }
  }
  async function restoreSession() {
    const revision = sessionRevision;
    try {
      const saved = await sessionStorage('readonly', store => store.getAll());
      if (revision !== sessionRevision) return;
      // IndexedDB returns keys in order: audio, config.
      if (saved?.[0] instanceof Blob && saved[1]?.format === 'transcribe-config') {
        const file = new File([saved[0]], saved[1].audio.name, { type: saved[0].type });
        await loadFile(file, saved[1]);
      }
    } catch {
      if (revision === sessionRevision) showConfigStatus('Local save unavailable');
    }
  }

  function captureConfig() {
    return {
      format: 'transcribe-config', version: 1,
      audio: { name: elements.fileName.textContent, identity: marks.identity },
      annotations: marks.document(),
      settings: {
        ...Object.fromEntries(configFields.map(key => [key, elements[key].value])),
        speed: elements.audio.playbackRate, pitchLock: elements.audio.preservesPitch,
        zoom: state.zoom, viewStart: state.viewStart,
        loopStart: state.loopStart, loopEnd: state.loopEnd, loopEnabled: state.loopEnabled,
        spectrumScroll: state.spectrumScrollProgress, viewMode: app.dataset.viewMode,
        controlsOpen: !controlsPanel.hidden
      }
    };
  }

  function validateConfig(value) {
    if (value?.format !== 'transcribe-config' || value.version !== 1) throw Error('Choose a supported Transcribe config file.');
    if (value.audio?.identity !== marks.identity) throw Error('This config belongs to a different audio file. Open the original recording first.');
    const annotations = TranscribeMarks.validate(value.annotations, marks.identity, state.duration);
    const settings = value.settings;
    const invalid = () => { throw Error('The config contains invalid settings. Nothing was imported.'); };
    if (!settings || typeof settings !== 'object') invalid();
    for (const key of configFields) {
      const input = elements[key], v = settings[key];
      if (typeof v !== 'string' || !v.trim()) invalid();
      if (input.tagName === 'SELECT') {
        if (![...input.options].some(option => option.value === v)) invalid();
      } else if (!Number.isFinite(Number(v)) || Number(v) < Number(input.min) || Number(v) > Number(input.max) || Math.abs((Number(v) - Number(input.min)) / Number(input.step) - Math.round((Number(v) - Number(input.min)) / Number(input.step))) > 0.000001) invalid();
    }
    for (const [key, min, max] of [['speed', .25, 2], ['zoom', 1, 32], ['viewStart', 0, state.duration], ['spectrumScroll', 0, 1]]) {
      if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) invalid();
    }
    for (const key of ['pitchLock', 'loopEnabled', 'controlsOpen']) if (typeof settings[key] !== 'boolean') invalid();
    if (!['timeline', 'analysis'].includes(settings.viewMode)) invalid();
    if (settings.loopStart === null && settings.loopEnd === null) {
      if (settings.loopEnabled) invalid();
    } else if (!Number.isFinite(settings.loopStart) || !Number.isFinite(settings.loopEnd) || settings.loopStart < 0 || settings.loopEnd > state.duration || settings.loopEnd - settings.loopStart < .04) invalid();
    return { annotations, settings };
  }

  function applyConfig({ annotations, settings: saved }) {
    elements.audio.pause();
    marks.clearImport();
    marks.change(() => { marks.doc = annotations; marks.selected = null; });
    for (const key of configFields) elements[key].value = saved[key];
    elements.semitonesNumber.value = saved.semitones;
    elements.centsNumber.value = saved.cents;
    setPlaybackSpeed(saved.speed);
    closeCustomSpeedControl();
    elements.audio.preservesPitch = saved.pitchLock;
    elements.pitchLock.setAttribute('aria-pressed', String(saved.pitchLock));
    elements.pitchLock.classList.toggle('is-active', saved.pitchLock);
    elements.pitchLock.querySelector('strong').textContent = saved.pitchLock ? 'On' : 'Off';
    state.loopStart = saved.loopStart;
    state.loopEnd = saved.loopEnd;
    state.loopEnabled = saved.loopEnabled;
    if (saved.loopStart !== null) setSelection(saved.loopStart, saved.loopEnd, false);
    else elements.selectionStatus.textContent = '';
    state.zoom = saved.zoom;
    elements.zoom.value = String(saved.zoom <= 16 ? (saved.zoom - 1) / 15 * 50 : 50 + (saved.zoom - 16) / 16 * 50);
    elements.zoom.setAttribute('aria-valuetext', `${Math.round(saved.zoom * 100)}%`);
    state.viewStart = saved.viewStart;
    normalizeViewStart();
    app.dataset.viewMode = saved.viewMode;
    elements.viewButtons.forEach(button => {
      const active = button.dataset.viewMode === saved.viewMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    controlsPanel.hidden = !saved.controlsOpen;
    controlsToggle.setAttribute('aria-expanded', String(saved.controlsOpen));
    reconnectChannels(); updateFilters(); updateVolume(); updatePitchShift();
    updateLoopControls(); updateTimecode(); renderAll();
    requestAnimationFrame(() => {
      elements.analysisGrid.scrollLeft = (elements.analysisGrid.scrollWidth - elements.analysisGrid.clientWidth) * saved.spectrumScroll;
      updateSpectrumScrollState(); resizeCanvases();
    });
  }

  document.getElementById('transcribe-config-export').addEventListener('click', () => {
    if (document.getElementById('transcribe-config-export').disabled || !marks.identity) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(captureConfig(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = elements.fileName.textContent.replace(/\.[^.]+$/, '') + '.transcribe.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showConfigStatus('Config exported. Audio is not included.');
  });
  document.getElementById('transcribe-config-import').addEventListener('click', () => configFile.click());
  async function importConfig(file) {
    const generation = marks.generation;
    if (!file) return;
    if (document.getElementById('transcribe-config-import').disabled) {
      showConfigStatus('Open the original audio file before loading its config.');
      return;
    }
    try {
      if (file.size > 20000000) throw Error('Config file is too large.');
      const text = await file.text();
      if (generation !== marks.generation) return;
      applyConfig(validateConfig(JSON.parse(text)));
      showConfigStatus('Config loaded. Markers and settings restored.');
    } catch (error) {
      if (generation === marks.generation) showConfigStatus(error instanceof SyntaxError ? 'This file is not valid JSON. Nothing was imported.' : error.message);
    }
  }
  configFile.addEventListener('change', () => {
    const file = configFile.files[0];
    configFile.value = '';
    importConfig(file);
  });

  elements.empty.addEventListener('click', () => elements.file.click());
  const timeline = app.querySelector('.transcribe-timeline');
  let dragDepth = 0;
  const fileDrag = event => [...(event.dataTransfer?.types || [])].includes('Files');
  timeline.addEventListener('dragenter', event => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    dragDepth++;
    timeline.classList.add('is-file-drop');
  });
  timeline.addEventListener('dragover', event => {
    if (!fileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  timeline.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) { dragDepth = 0; timeline.classList.remove('is-file-drop'); }
  });
  timeline.addEventListener('drop', async event => {
    event.preventDefault();
    dragDepth = 0;
    timeline.classList.remove('is-file-drop');
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length !== 1) { showConfigStatus('Drop one audio or config file at a time.'); return; }
    const file = files[0];
    if (/\.json$/i.test(file.name) || file.type === 'application/json') await importConfig(file);
    else if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|oga|opus|aif|aiff|webm)$/i.test(file.name)) await loadFile(file);
    else showConfigStatus('Choose an audio file or a Transcribe JSON config.');
  });

  async function loadFile(file, restoredConfig = null) {
    if (!file) {
      return;
    }

    sessionFile = null;
    sessionRevision++;
    if (state.fileUrl) {
      URL.revokeObjectURL(state.fileUrl);
    }

    configActions.querySelectorAll('button').forEach(button => { button.disabled = true; });
    showConfigStatus('');
    marks.reset();
    const loadGeneration = marks.generation;
    elements.audio.pause();
    state.fileUrl = URL.createObjectURL(file);
    elements.audio.src = state.fileUrl;
    elements.fileName.textContent = file.name;
    elements.localStatus.textContent = 'Decoding';
    elements.empty.hidden = true;
    elements.selectionStatus.textContent = 'Preparing waveform…';
    setControlsEnabled(false);

    try {
      await initializeAudioGraph();
      const buffer = await file.arrayBuffer();
      const decoded = await state.audioContext.decodeAudioData(buffer.slice(0));
      if (loadGeneration !== marks.generation) return;
      state.audioBuffer = decoded;
      state.duration = state.audioBuffer.duration;
      const marksReady = marks.load(buffer);
      state.zoom = 16;
      state.viewStart = 0;
      state.loopStart = null;
      state.loopEnd = null;
      state.loopEnabled = false;
      state.spectrogram = null;
      state.spectrumCursor = null;
      state.likelyNotes = [];
      state.analysisId += 1;
      state.analysisInFlight = false;
      state.pendingSpectrumTime = null;
      state.lastSpectrumTime = null;
      resetPitchReadout();

      const samples = new Float32Array(state.audioBuffer.length);
      for (let channel = 0; channel < state.audioBuffer.numberOfChannels; channel += 1) {
        const data = state.audioBuffer.getChannelData(channel);
        for (let index = 0; index < data.length; index += 1) {
          samples[index] += data[index] / state.audioBuffer.numberOfChannels;
        }
      }

      worker.postMessage({
        type: 'set-audio',
        samples,
        sampleRate: state.audioBuffer.sampleRate,
        bucketCount: 32768
      }, [samples.buffer]);

      elements.localStatus.textContent = 'Local';
      elements.audioFormat.textContent = `${(state.audioBuffer.sampleRate / 1000).toFixed(1)} kHz · ${state.audioBuffer.numberOfChannels === 1 ? 'Mono' : `${state.audioBuffer.numberOfChannels} channels`} · local`;
      elements.selectionStatus.textContent = '';
      elements.zoom.value = '50';
      elements.zoom.setAttribute('aria-valuetext', '1600%');
      setPlaybackSpeed(1);
      elements.audio.preservesPitch = true;
      elements.semitones.value = '0';
      elements.semitonesNumber.value = '0';
      elements.cents.value = '0';
      elements.centsNumber.value = '0';
      updatePitchShift();
      setControlsEnabled(true);
      updateLoopControls();
      updateTimecode();
      renderAll();
      requestSpectrumAt(0, true);
      await marksReady;
      if (loadGeneration === marks.generation) {
        configActions.querySelectorAll('button').forEach(button => { button.disabled = !marks.identity; });
        if (restoredConfig) {
          try { applyConfig(validateConfig(restoredConfig)); }
          catch { showConfigStatus('Saved settings could not be restored. The audio is available.'); }
        }
        sessionFile = file;
        savedSessionJSON = null;
        sessionAudioSaved = Boolean(restoredConfig);
        saveSession();
      }
    } catch (error) {
      if (loadGeneration !== marks.generation) return;
      marks.reset();
      console.error(error);
      showConfigStatus('Not saved · export config');
      elements.localStatus.textContent = 'Error';
      elements.selectionStatus.textContent = 'This file could not be decoded. Try MP3, WAV, M4A, FLAC, or Ogg audio.';
      elements.audioFormat.textContent = 'Unsupported or damaged audio';
      elements.empty.hidden = false;
      elements.empty.querySelector('strong').textContent = 'Could not open audio';
      elements.empty.querySelector('span').textContent = 'Try another supported audio file.';
      setControlsEnabled(false);
    }
  }

  function waveformPointerPosition(event) {
    const rect = elements.waveform.getBoundingClientRect();
    return { x: clamp(event.clientX - rect.left, 0, rect.width), width: rect.width };
  }

  function handleWaveformPointerDown(event) {
    if (!state.duration || event.button !== 0) {
      return;
    }

    const { x, width } = waveformPointerPosition(event);
    const time = xToTime(x, width);
    const boundaryThreshold = (9 / width) * viewDuration();

    if (state.loopStart !== null && Math.abs(time - state.loopStart) < boundaryThreshold) {
      state.dragging = 'start';
    } else if (state.loopEnd !== null && Math.abs(time - state.loopEnd) < boundaryThreshold) {
      state.dragging = 'end';
    } else {
      state.dragging = 'pending';
    }

    state.dragOriginX = x;
    elements.waveform.setPointerCapture(event.pointerId);
    drawWaveform();
  }

  function handleWaveformPointerMove(event) {
    if (!state.dragging) {
      return;
    }

    const { x, width } = waveformPointerPosition(event);
    const time = xToTime(x, width);

    if (state.dragging === 'pending') {
      if (Math.abs(x - state.dragOriginX) < 5) return;
      state.dragging = 'new';
      state.loopStart = xToTime(state.dragOriginX, width);
    }

    if (state.dragging === 'start') {
      state.loopStart = Math.min(time, state.loopEnd - 0.04);
    } else if (state.dragging === 'end') {
      state.loopEnd = Math.max(time, state.loopStart + 0.04);
    } else {
      state.loopEnd = time;
    }
    drawWaveform();
    drawOverview();
  }

  function handleWaveformPointerUp(event) {
    if (!state.dragging) {
      return;
    }

    const { x, width } = waveformPointerPosition(event);
    const moved = Math.abs(x - state.dragOriginX);
    const pending = state.dragging === 'pending';
    state.dragging = null;

    if (pending || moved < 4) {
      const time = xToTime(x, width);
      elements.audio.currentTime = time;
      state.loopStart = null;
      state.loopEnd = null;
      state.loopEnabled = false;
      setSelection(0, 0);
      renderAll();
      return;
    }

    setSelection(state.loopStart, state.loopEnd);
    setLoopEnabled(true);
  }

  function updateOverviewDrag(event) {
    if (!state.overviewDrag || !state.duration) return;
    const rect = elements.overview.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const start = ((x - state.overviewDrag.offsetX) / Math.max(1, rect.width)) * state.duration;
    setTimelineViewStart(start);
  }

  function handleOverviewPointerDown(event) {
    if (!state.duration) return;
    const rect = elements.overview.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const viewportX = (state.viewStart / state.duration) * rect.width;
    const viewportWidth = (viewDuration() / state.duration) * rect.width;
    const insideViewport = x >= viewportX && x <= viewportX + viewportWidth;
    state.overviewDrag = {
      offsetX: insideViewport ? x - viewportX : viewportWidth / 2,
      pointerId: event.pointerId
    };
    elements.overview.setPointerCapture(event.pointerId);
    if (!insideViewport) {
      elements.audio.currentTime = clamp((x / rect.width) * state.duration, 0, state.duration);
    }
    updateOverviewDrag(event);
  }

  function finishOverviewDrag(event) {
    if (!state.overviewDrag) return;
    if (elements.overview.hasPointerCapture(event.pointerId)) elements.overview.releasePointerCapture(event.pointerId);
    state.overviewDrag = null;
  }

  function handleSpectrogramPointer(event) {
    if (!state.spectrogram) {
      return;
    }

    const rect = elements.spectrogram.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const continuousMidi = keyboardXToMidi(x, rect.width);
    const time = (state.spectrogram.start + state.spectrogram.end) / 2;
    updatePitchReadout(time, continuousMidi);
    drawSpectrogram();
  }

  function handleSpectrogramKeydown(event) {
    if (!state.spectrogram || !['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (!state.spectrumCursor) {
      setDominantPitchCursor(0.5);
    }

    const time = (state.spectrogram.start + state.spectrogram.end) / 2;
    const midi = clamp(
      state.spectrumCursor.midi + (event.key === 'ArrowLeft' ? -0.1 : 0.1),
      state.spectrogram.minimumMidi,
      state.spectrogram.maximumMidi
    );
    updatePitchReadout(time, midi);
    drawSpectrogram();
  }

  function updatePlaybackFrame() {
    updateTimecode();

    if (state.loopEnabled && state.loopStart !== null && state.loopEnd !== null && elements.audio.currentTime >= state.loopEnd) {
      elements.audio.currentTime = state.loopStart;
    }

    if (state.zoom > 1 && elements.audio.currentTime > state.viewStart + viewDuration() * 0.92) {
      normalizeViewStart(elements.audio.currentTime);
      syncTimelineScroll();
      drawOverview();
    }

    drawWaveform();
    requestSpectrumAt(elements.audio.currentTime);
    if (!elements.audio.paused) {
      state.animationFrame = requestAnimationFrame(updatePlaybackFrame);
    }
  }

  worker.addEventListener('message', (event) => {
    const message = event.data || {};

    if (message.type === 'peaks') {
      state.peaks = new Float32Array(message.peaks);
      renderAll();
    }

    if (message.type === 'spectrogram' && message.id === state.analysisId) {
      state.analysisInFlight = false;
      state.spectrogram = {
        data: new Float32Array(message.data),
        frames: message.frames,
        rows: message.rows,
        binsPerSemitone: message.binsPerSemitone,
        minimumMidi: message.minimumMidi,
        maximumMidi: message.maximumMidi,
        center: message.center,
        start: message.start,
        end: message.end
      };
      elements.analysisProgress.hidden = true;
      elements.frequencyReadout.textContent = `${formatTime(message.center)} · live · 6.25¢ steps`;
      drawSpectrogram();
      if (state.likelyNotes.length) {
        updatePitchReadout(message.center, state.likelyNotes[0].preciseMidi);
        drawSpectrogram();
      } else {
        state.spectrumCursor = null;
        resetPitchReadout();
        drawSpectrogram();
      }
      const likelyNames = state.likelyNotes.slice(0, 5).map((note) => midiToName(note.midi));
      elements.frequencyReadout.textContent = likelyNames.length
        ? `${formatTime(message.center)} · likely ${likelyNames.join(', ')} · relative`
        : `${formatTime(message.center)} · no distinct peaks`;
      if (state.pendingSpectrumTime !== null) {
        const pendingTime = state.pendingSpectrumTime;
        state.pendingSpectrumTime = null;
        requestSpectrumAt(pendingTime, true);
      }
    }
  });

  elements.fileName.addEventListener('click', () => elements.file.click());
  elements.file.addEventListener('change', () => loadFile(elements.file.files?.[0]));
  elements.speedButtons.forEach((button) => {
    button.addEventListener('click', () => setPlaybackSpeed(Number(button.dataset.speed)));
  });
  elements.customSpeedToggle.addEventListener('click', toggleCustomSpeedControl);
  elements.customSpeedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      elements.customSpeedInput.blur();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      elements.customSpeedInput.value = String(Math.round(elements.audio.playbackRate * 100));
      closeCustomSpeedControl();
      elements.customSpeedToggle.focus();
    }
  });
  elements.customSpeedInput.addEventListener('blur', applyCustomSpeed);
  elements.pitchLock.addEventListener('click', () => {
    const enabled = elements.pitchLock.getAttribute('aria-pressed') !== 'true';
    elements.pitchLock.setAttribute('aria-pressed', String(enabled));
    elements.pitchLock.classList.toggle('is-active', enabled);
    elements.pitchLock.querySelector('strong').textContent = enabled ? 'On' : 'Off';
    elements.audio.preservesPitch = enabled;
  });
  connectPitchControl(elements.semitones, elements.semitonesNumber);
  connectPitchControl(elements.cents, elements.centsNumber);
  elements.loopBottom.addEventListener('click', toggleLoop);
  elements.channel.addEventListener('change', reconnectChannels);
  elements.highpass.addEventListener('change', updateFilters);
  elements.lowpass.addEventListener('change', updateFilters);
  elements.spectrumScale.addEventListener('change', drawSpectrogram);
  elements.noteTolerance.addEventListener('change', () => {
    drawSpectrogram();
    if (state.spectrogram) {
      const likelyNames = state.likelyNotes.slice(0, 5).map((note) => midiToName(note.midi));
      elements.frequencyReadout.textContent = likelyNames.length
        ? `${formatTime(state.spectrogram.center)} · likely ${likelyNames.join(', ')} · relative`
        : `${formatTime(state.spectrogram.center)} · no distinct peaks`;
    }
  });
  elements.start.addEventListener('click', () => {
    elements.audio.currentTime = 0;
    state.viewStart = 0;
    renderAll();
    requestSpectrumAt(0, true);
  });
  elements.rewind.addEventListener('click', () => seekBy(-5));
  elements.play.addEventListener('click', togglePlayback);
  elements.forward.addEventListener('click', () => seekBy(5));
  elements.seek.addEventListener('input', () => {
    seekBy(Number(elements.seek.value) - elements.audio.currentTime);
    requestSpectrumAt(elements.audio.currentTime);
  });
  elements.volume.addEventListener('input', updateVolume);
  elements.zoom.addEventListener('input', () => {
    const position = Number(elements.zoom.value);
    const zoom = position <= 50
      ? 1 + (position / 50) * 15
      : 16 + ((position - 50) / 50) * 16;
    setZoom(zoom);
  });

  elements.overview.addEventListener('pointerdown', handleOverviewPointerDown);
  elements.overview.addEventListener('pointermove', updateOverviewDrag);
  elements.overview.addEventListener('pointerup', finishOverviewDrag);
  elements.overview.addEventListener('pointercancel', finishOverviewDrag);
  elements.overview.addEventListener('wheel', (event) => {
    const delta = event.deltaX || event.deltaY;
    if (!delta || state.zoom <= 1) return;
    event.preventDefault();
    panTimelineByPixels(delta, elements.overview.clientWidth);
  }, { passive: false });
  elements.waveform.addEventListener('pointerdown', handleWaveformPointerDown);
  elements.waveform.addEventListener('pointermove', handleWaveformPointerMove);
  elements.waveform.addEventListener('pointerup', handleWaveformPointerUp);
  elements.waveform.addEventListener('pointercancel', handleWaveformPointerUp);
  elements.waveform.addEventListener('wheel', (event) => {
    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    if (!horizontalDelta || state.zoom <= 1) {
      return;
    }
    event.preventDefault();
    panTimelineByPixels(horizontalDelta, elements.waveform.clientWidth);
  }, { passive: false });
  elements.overviewNavigator.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowLeft' || event.key === 'PageUp' ? -1 : 1;
    const amount = event.key === 'Home' || event.key === 'End'
      ? state.duration
      : viewDuration() * (event.key.startsWith('Page') ? 0.8 : 0.08);
    if (event.key === 'Home') setTimelineViewStart(0);
    else if (event.key === 'End') setTimelineViewStart(state.duration);
    else setTimelineViewStart(state.viewStart + direction * amount);
  });
  elements.spectrogram.addEventListener('pointerdown', handleSpectrogramPointer);
  elements.spectrogram.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.buttons === 1) {
      handleSpectrogramPointer(event);
    }
  });
  elements.spectrogram.addEventListener('keydown', handleSpectrogramKeydown);
  elements.analysisGrid.addEventListener('scroll', updateSpectrumScrollState, { passive: true });
  elements.analysisGrid.addEventListener('wheel', (event) => {
    const maximumScroll = Math.max(0, elements.analysisGrid.scrollWidth - elements.analysisGrid.clientWidth);
    const horizontalDelta = event.deltaX || event.deltaY;
    if (!maximumScroll || !horizontalDelta) return;
    const nextScrollLeft = clamp(elements.analysisGrid.scrollLeft + horizontalDelta, 0, maximumScroll);
    if (nextScrollLeft === elements.analysisGrid.scrollLeft) return;
    event.preventDefault();
    elements.analysisGrid.scrollLeft = nextScrollLeft;
  }, { passive: false });
  elements.analysisGrid.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowLeft' || event.key === 'PageUp' ? -1 : 1;
    const amount = event.key === 'Home' || event.key === 'End'
      ? elements.analysisGrid.scrollWidth
      : elements.analysisGrid.clientWidth * (event.key.startsWith('Page') ? 0.8 : 0.12);
    const left = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? elements.analysisGrid.scrollWidth
        : elements.analysisGrid.scrollLeft + direction * amount;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    elements.analysisGrid.scrollTo({ left, behavior });
  });

  elements.audio.addEventListener('play', () => {
    elements.play.classList.add('is-playing');
    elements.play.setAttribute('aria-label', 'Pause');
    elements.play.title = 'Pause';
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = requestAnimationFrame(updatePlaybackFrame);
  });
  elements.audio.addEventListener('pause', () => {
    elements.play.classList.remove('is-playing');
    elements.play.setAttribute('aria-label', 'Play');
    elements.play.title = 'Play';
    cancelAnimationFrame(state.animationFrame);
    renderAll();
    requestSpectrumAt(elements.audio.currentTime, true);
  });
  elements.audio.addEventListener('ended', () => {
    elements.play.classList.remove('is-playing');
    elements.play.setAttribute('aria-label', 'Play');
    elements.play.title = 'Play';
    updateTimecode();
  });
  elements.audio.addEventListener('seeked', () => {
    renderAll();
    requestSpectrumAt(elements.audio.currentTime, true);
  });

  elements.viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.viewMode;
      app.dataset.viewMode = mode;
      elements.viewButtons.forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle('is-active', active);
        candidate.setAttribute('aria-pressed', String(active));
      });
      requestAnimationFrame(resizeCanvases);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.isComposing || elements.workspace.hidden || document.activeElement?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      return;
    }

    // Controls keeps focus after a click, but Space remains a transport command.
    const controlsSpace = document.activeElement === controlsToggle && event.code === 'Space';
    if (!controlsSpace && ['BUTTON', 'SUMMARY'].includes(document.activeElement?.tagName) && ['Space', 'Enter'].includes(event.code)) return;
    if (marks.key(event)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === '?') {
      event.preventDefault();
      controlsPanel.hidden = false;
      controlsToggle.setAttribute('aria-expanded', 'true');
      document.getElementById('transcribe-shortcuts-title').focus();
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      togglePlayback();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBy(event.shiftKey ? -5 : -2);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(event.shiftKey ? 5 : 2);
    } else if (event.key.toLowerCase() === 'l') {
      toggleLoop();
    } else if (event.key === '[' && state.duration) {
      setSelection(elements.audio.currentTime, state.loopEnd ?? clamp(elements.audio.currentTime + 2, 0, state.duration));
    } else if (event.key === ']' && state.duration) {
      setSelection(state.loopStart ?? clamp(elements.audio.currentTime - 2, 0, state.duration), elements.audio.currentTime);
    }
  });

  const controlsToggle = document.getElementById('transcribe-controls-toggle');
  const controlsPanel = document.getElementById('transcribe-controls-panel');
  controlsToggle.addEventListener('click', () => {
    controlsPanel.hidden = !controlsPanel.hidden;
    controlsToggle.setAttribute('aria-expanded', String(!controlsPanel.hidden));
  });
  controlsPanel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    controlsPanel.hidden = true;
    controlsToggle.setAttribute('aria-expanded', 'false');
    controlsToggle.focus();
  });

  const resizeObserver = new ResizeObserver(() => resizeCanvases());
  [elements.overview, elements.waveform, elements.analysisGrid].forEach((element) => resizeObserver.observe(element));

  app.dataset.viewMode = 'timeline';
  requestAnimationFrame(() => {
    resizeCanvases();
    showConfigStatus('Transcribe is in beta and probably has a few issues.');
  });
  updateLoopControls();
  updateTimecode();
  // Save after handlers finish, including keyboard edits and pointer interactions.
  for (const event of ['input', 'change', 'click', 'keyup', 'pointerup', 'pointermove', 'wheel']) {
    app.addEventListener(event, () => queueMicrotask(saveSession));
  }
  for (const event of ['pause', 'seeked', 'ratechange']) elements.audio.addEventListener(event, saveSession);
  setInterval(saveSession, 500);
  document.addEventListener('visibilitychange', saveSession);
  window.addEventListener('pagehide', saveSession);
  restoreSession();
})();
