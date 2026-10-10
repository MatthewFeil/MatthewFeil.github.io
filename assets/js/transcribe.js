(() => {
  const app = document.querySelector('[data-transcribe-app]');

  if (!app) {
    return;
  }

  let resettingControls = false;
  const interaction = action => {
    if (!resettingControls) window.siteAnalytics?.track('tool_interaction', 'transcribe', action);
  };

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
    analyzeSelection: document.getElementById('transcribe-analyze-selection'),
    detectionMode: document.getElementById('transcribe-detection-mode'),
    detectionLow: document.getElementById('transcribe-detection-low'),
    detectionHigh: document.getElementById('transcribe-detection-high'),
    overviewNavigator: document.getElementById('transcribe-overview-navigator'),
    overview: document.getElementById('transcribe-overview'),
    waveform: document.getElementById('transcribe-waveform'),
    waveformHoverGuide: document.getElementById('transcribe-waveform-hover-guide'),
    empty: document.getElementById('transcribe-empty'),
    loading: document.getElementById('transcribe-loading'),
    loadingStage: document.getElementById('transcribe-loading-stage'),
    loadingFile: document.getElementById('transcribe-loading-file'),
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
    selectionOnly: document.getElementById('transcribe-selection-only'),
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
    selectionOnly: false,
    dragging: null,
    dragOriginX: 0,
    dragPointerX: 0,
    dragMoved: false,
    dragScrollFrame: null,
    dragScrollTime: null,
    hoverPointerX: null,
    hoverScrollFrame: null,
    hoverScrollTime: null,
    overviewDrag: null,
    analysisId: 0,
    analysisInFlight: false,
    pendingSpectrumTime: null,
    pendingSpectrumForce: false,
    spectrumRequestInvalidated: false,
    nextSpectrumUpdateAt: 0,
    lastSpectrumTime: null,
    spectrogram: null,
    spectrumCursor: null,
    likelyNotes: [],
    spectrumScrollInitialized: false,
    spectrumScrollProgress: 0.25,
    animationFrame: null,
    audioContext: null,
    mediaSource: null,
    transportSink: null,
    highpassNode: null,
    lowpassNode: null,
    eqNodes: [],
    pitchNode: null,
    stretchNode: null,
    stretchProcessorName: null,
    stretchEnabled: null,
    smoothNode: null,
    smoothReady: false,
    smoothEnabled: false,
    smoothRevision: 0,
    smoothLoadPromise: Promise.resolve(),
    pitchOutput: null,
    splitterNode: null,
    leftGain: null,
    rightGain: null,
    mergerNode: null,
    outputGain: null
  };

  const transport = new TranscribeStems.Transport(elements.audio, () => state.fileUrl, message => stems?.setStatus(message));
  let stems = null;
  let marks = null;
  marks = new TranscribeMarks.Marks({
    duration: () => state.duration,
    current: () => transport.currentTime,
    x: (time, width) => timeToX(time, width),
    time: (x, width) => xToTime(x, width),
    seek: (time) => seekBy(time - transport.currentTime),
    anchor: (time) => {
      state.loopStart = time; state.loopEnd = time; state.loopEnabled = false;
      updateLoopControls(); renderAll();
      elements.selectionStatus.textContent = `Endpoint ${formatTime(time)} · Move the mouse and click to place the other endpoint`;
    },
    preview: (anchor, time) => {
      state.loopStart = Math.min(anchor, time);
      state.loopEnd = Math.max(anchor, time);
      drawWaveform(); drawOverview();
    },
    selectRange: (start, end) => {
      setSelection(start, end);
      state.loopEnabled = false;
      updateLoopControls(); renderAll();
    },
    loop: (start, end) => {
      setSelection(start, end);
      state.loopEnabled = true;
      transport.currentTime = start;
      normalizeViewStart(start);
      updateLoopControls();
      renderAll();
    },
    render: () => { if (marks) { marks.draw(); drawOverview(); } }
  });

  const worker = new Worker(new URL('transcribe-analysis-worker.js?v=20261004-melody-dropouts', scriptUrl));
  let detectionSettings = TranscribeNotes.defaults();
  const noteTracker = new TranscribeNotes.Tracker();
  const colors = {};
  function updateThemeColors() {
    const style = getComputedStyle(document.documentElement);
    const tokens = { background: 'bg', text: 'text', muted: 'muted', border: 'canvas-border', borderStrong: 'canvas-border-strong', accent: 'accent', accentSoft: 'accent-soft', grid: 'grid' };
    for (const [name, token] of Object.entries(tokens)) colors[name] = style.getPropertyValue(`--tr-${token}`).trim();
  }
  updateThemeColors();
  const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const blackPitchClasses = new Set([1, 3, 6, 8, 10]);
  const mobileWorkspace = window.matchMedia('(max-width: 720px), (max-height: 500px) and (pointer: coarse)');
  const minimumSpectrumMidi = 24;
  const maximumSpectrumMidi = 96;
  const spectrumWhiteKeyCount = 42;
  const spectrumWindowSeconds = 0.4;
  const spectrumUpdateIntervalMs = 1000 / 30;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function setPlaybackSpeed(speed) {

    elements.audio.playbackRate = speed;
    updatePitchPreservation();
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
    const changed = elements.audio.playbackRate !== percent / 100;
    setPlaybackSpeed(percent / 100);
    if (changed && state.duration) interaction('custom_speed_changed');
    if (state.duration) window.siteAnalytics?.track('tool_action', 'transcribe', 'speed_changed');
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
    const stretchPitch = state.stretchNode?.parameters.get('pitch');
    if (stretchPitch && state.audioContext) {
      stretchPitch.setValueAtTime(2 ** (pitchShiftCents() / 1200), state.audioContext.currentTime);
    }
    if (state.smoothEnabled) state.smoothNode.schedule({ semitones: pitchShiftCents() / 100 });
    if (state.audioBuffer) {
      state.lastSpectrumTime = null;
      state.spectrogram = null;
      state.spectrumCursor = null;
      state.likelyNotes = [];
      resetPitchReadout();
      requestSpectrumAt(transport.currentTime, true);
    }
  }

  function updatePitchPreservation() {
    const locked = elements.pitchLock.getAttribute('aria-pressed') === 'true';
    const speed = elements.audio.playbackRate;
    // Near normal speed, the browser's native pitch preservation avoids the
    // granular noise the custom stretcher can add to sustained instruments.
    const useStretch = locked && speed < 0.8;
    const useSmooth = useStretch && state.smoothReady && !transport.range;
    // The worklet receives uncorrected audio and reverses the pitch change from
    // the media element's speed. The media element remains the transport clock.
    elements.audio.preservesPitch = locked && (!useStretch || (!state.stretchNode && !useSmooth));
    if (!state.pitchNode) return;
    if (useSmooth !== state.smoothEnabled) {
      if (useSmooth) {
        state.mediaSource.disconnect(state.highpassNode);
        state.smoothNode.connect(state.highpassNode);
      } else {
        state.smoothNode.disconnect(state.highpassNode);
        state.mediaSource.connect(state.highpassNode);
        state.smoothNode.schedule({ active: false });
      }
      state.smoothEnabled = useSmooth;
    }
    if (useStretch && !useSmooth && state.stretchNode && state.stretchEnabled === false) resetStretchProcessor();
    state.stretchNode?.parameters.get('playbackRate').setValueAtTime(speed, state.audioContext.currentTime);
    state.eqNodes.at(-1).disconnect();
    state.pitchNode.disconnect();
    state.stretchNode?.disconnect();
    const target = useSmooth ? state.pitchOutput : useStretch && state.stretchNode ? state.stretchNode : state.pitchNode;
    state.eqNodes.at(-1).connect(target);
    if (target !== state.pitchOutput) target.connect(state.pitchOutput);
    state.stretchEnabled = useStretch && !useSmooth && Boolean(state.stretchNode);
    if (useSmooth) syncSmoothPlayback();
  }

  function syncSmoothPlayback() {
    if (!state.smoothEnabled) return;
    const loopStart = state.loopEnabled
      ? (selectionPlayback() ? state.loopStart : 0)
      : 0;
    const loopEnd = state.loopEnabled
      ? (selectionPlayback() ? state.loopEnd : state.duration)
      : 0;
    state.smoothNode.schedule({
      active: !elements.audio.paused,
      input: clamp(transport.currentTime, 0, state.duration),
      rate: elements.audio.playbackRate,
      semitones: pitchShiftCents() / 100,
      loopStart,
      loopEnd,
      output: state.audioContext.currentTime
    });
  }

  async function prepareSmoothTrack(buffer, revision) {
    if (!state.smoothNode) return;
    state.smoothLoadPromise = state.smoothLoadPromise.then(async () => {
      try {
        await state.smoothNode.dropBuffers();
        if (revision !== state.smoothRevision) return;
        if (buffer.length * 2 * 4 > 120 * 1024 * 1024) return;
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1));
        await state.smoothNode.addBuffers([left, right]);
        if (revision !== state.smoothRevision) return;
        state.smoothReady = true;
        updatePitchPreservation();
      } catch (error) {
        console.warn('Direct audio stretching unavailable; using pitch-lock worklet.', error);
      }
    });
    return state.smoothLoadPromise;
  }

  function resetStretchProcessor() {
    if (!state.stretchNode) return;
    state.stretchNode.disconnect();
    if (state.stretchEnabled) state.eqNodes.at(-1).disconnect(state.stretchNode);
    state.stretchNode = createStretchProcessor();
    if (state.stretchEnabled) {
      state.eqNodes.at(-1).connect(state.stretchNode);
      state.stretchNode.connect(state.pitchOutput);
    }
  }

  function createStretchProcessor() {
    return new AudioWorkletNode(state.audioContext, state.stretchProcessorName, {
      parameterData: { pitch: 2 ** (pitchShiftCents() / 1200), playbackRate: elements.audio.playbackRate },
      processorOptions: state.stretchProcessorName === 'phase-vocoder-processor'
        ? { fftSize: 2048, overlapFactor: 8 } : {},
      outputChannelCount: [2]
    });
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
    const boundedMidi = clamp(midi, minimumSpectrumMidi - 0.5, maximumSpectrumMidi - 0.5);
    const keyWidth = width / spectrumWhiteKeyCount;
    if (boundedMidi < minimumSpectrumMidi) return (boundedMidi - minimumSpectrumMidi + 0.5) * keyWidth;
    if (boundedMidi > maximumSpectrumMidi - 1) return width + (boundedMidi - maximumSpectrumMidi + 0.5) * keyWidth;
    const lowerMidi = Math.floor(boundedMidi);
    const fraction = boundedMidi - lowerMidi;
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
    let previousMidi = minimumSpectrumMidi - 0.5;
    let previousX = midiCenterToKeyboardX(previousMidi, width);
    for (let midi = minimumSpectrumMidi; midi < maximumSpectrumMidi; midi += 1) {
      const nextX = midiCenterToKeyboardX(midi, width);
      if (boundedX <= nextX) {
        return previousMidi + (midi - previousMidi) * clamp((boundedX - previousX) / Math.max(1, nextX - previousX), 0, 1);
      }
      previousMidi = midi;
      previousX = nextX;
    }
    return previousMidi + (boundedX - previousX) / Math.max(1, width - previousX) * 0.5;
  }

  // Match the painted key shapes, including the white area below black keys.
  function keyboardNoteAt(x, y, width, height) {
    const keyWidth = width / spectrumWhiteKeyCount;
    if (y < height * 0.64) {
      for (let midi = minimumSpectrumMidi; midi < maximumSpectrumMidi; midi += 1) {
        if (isBlackKey(midi) && Math.abs(x - whiteKeysBefore(midi) * keyWidth) <= keyWidth * 0.31) return midi;
      }
    }
    const index = Math.floor(x / keyWidth);
    for (let midi = minimumSpectrumMidi; midi < maximumSpectrumMidi; midi += 1) {
      if (!isBlackKey(midi) && whiteKeysBefore(midi) === index) return midi;
    }
    return null;
  }

  let keyboardAudioContext = null;
  const keyboardVoices = new Map();
  async function playKeyboardNote(midi, pointerId) {
    stopKeyboardNote(pointerId);
    const voice = {};
    keyboardVoices.set(pointerId, voice);
    // Keep reference notes independent of the track's pitch and filters.
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!keyboardAudioContext || keyboardAudioContext.state === 'closed') keyboardAudioContext = new AudioContextClass();
    const context = keyboardAudioContext;
    if (context.state === 'suspended') await context.resume();
    if (keyboardVoices.get(pointerId) !== voice) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.01);
    Object.assign(voice, { context, oscillator, gain, startedAt: now });
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    interaction('piano_note_played');
  }

  function stopKeyboardNote(pointerId) {
    const voice = keyboardVoices.get(pointerId);
    keyboardVoices.delete(pointerId);
    if (!voice?.oscillator) return;
    const { context, oscillator, gain, startedAt } = voice;
    const now = context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.16 * Math.min(1, Math.max(0, (now - startedAt) / 0.01)), now);
    gain.gain.linearRampToValueAtTime(0, now + 0.06);
    oscillator.stop(now + 0.07);
  }

  function stopKeyboardNotes() {
    for (const pointerId of keyboardVoices.keys()) stopKeyboardNote(pointerId);
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
    elements.seek.min = String(transport.range?.start || 0);
    elements.seek.max = String(transport.range?.end ?? state.duration);
    elements.seek.value = String(transport.currentTime);
    elements.seek.setAttribute('aria-valuetext', `${formatPlaybackTime(transport.currentTime)} of ${formatPlaybackTime(state.duration)}`);
    elements.timecode.textContent = formatTime(transport.currentTime, false);
    elements.timeRemaining.textContent = `-${formatTime(Math.ceil(Math.max(0, state.duration - transport.currentTime)), false)}`;
  }

  function viewDuration() {
    return state.duration ? state.duration / state.zoom : 0;
  }

  function normalizeViewStart(centerTime = transport.currentTime || 0) {
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

  // Empty guides describe the workspace without implying recorded audio.
  function drawEmptyGuides(context, width, height, spectrum = false) {
    context.save();
    context.lineWidth = 1;
    context.strokeStyle = colors.grid;
    context.beginPath();
    if (spectrum) {
      for (let midi = minimumSpectrumMidi; midi < maximumSpectrumMidi; midi += 1) {
        if (midi % 12 !== 0) continue;
        const x = midiCenterToKeyboardX(midi, width);
        context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, height);
      }
    } else {
      const columns = Math.max(3, Math.floor(width / 100));
      for (let i = 0; i <= columns; i += 1) {
        const x = i / columns * width;
        context.moveTo(x + 0.5, 0); context.lineTo(x + 0.5, height);
      }
    }
    const levels = spectrum ? 4 : 2;
    for (let i = 1; i <= levels; i += 1) {
      const y = spectrum ? i / levels * height : (i - 0.5) / levels * height;
      context.moveTo(0, y + 0.5); context.lineTo(width, y + 0.5);
    }
    context.stroke();
    context.restore();
  }

  function drawOverview() {
    const { context, width, height } = configureCanvas(elements.overview);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    if (!state.peaks || !state.duration) {
      drawEmptyGuides(context, width, height);
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

    drawPeakRange(context, state.peaks, 0, state.peaks.length / 2, 0, width, 20 + Math.max(0, height - 38) / 2, Math.max(1, height - 38) / 2, colors.text);

    marks?.overview(context, width, height, state.duration);
    const visibleDuration = viewDuration();
    const viewportX = (state.viewStart / state.duration) * width;
    const viewportWidth = (visibleDuration / state.duration) * width;
    context.fillStyle = colors.grid;
    context.fillRect(viewportX, 20, viewportWidth, height - 23);
    context.strokeStyle = colors.accent;
    context.lineWidth = 1;
    context.strokeRect(viewportX + 0.5, 20.5, Math.max(1, viewportWidth - 1), height - 24);

    if (state.loopStart !== null && state.loopEnd !== null) {
      const startX = (Math.min(state.loopStart, state.loopEnd) / state.duration) * width;
      const endX = (Math.max(state.loopStart, state.loopEnd) / state.duration) * width;
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
      drawEmptyGuides(context, width, height);
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
      // While dragging, the fixed anchor can be to the right of the pointer.
      const startX = timeToX(Math.min(state.loopStart, state.loopEnd), width);
      const endX = timeToX(Math.max(state.loopStart, state.loopEnd), width);
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

    const playheadX = timeToX(transport.currentTime, width);
    if (playheadX >= 0 && playheadX <= width) {
      context.strokeStyle = colors.accent;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(playheadX, 0);
      context.lineTo(playheadX, height);
      context.stroke();
    }
  }

  function drawKeyboard() {
    const cursorMidi = document.activeElement === elements.keyboard && document.documentElement.dataset.keyboardNavigation === 'on'
      ? keyboardSelectedMidi : null;
    const { context, width, height } = configureCanvas(elements.keyboard);
    const whiteKeyWidth = width / spectrumWhiteKeyCount;
    const blackKeyWidth = whiteKeyWidth * 0.62;
    const now = performance.now();
    const highlighted = state.likelyNotes.map(note => ({...note, confidence:TranscribeNotes.highlightStrength(note, now)})).filter(note => note.confidence > 0);
    const likelyNotesByMidi = new Map(highlighted.map((note) => [note.midi, note]));
    const likelyNoteLabel = highlighted
      .map((note) => `${midiToName(note.midi)} ${Math.round(note.confidence * 100)} percent`)
      .join(', ');
    elements.keyboard.setAttribute('aria-label', likelyNoteLabel
      ? `Horizontal piano keyboard from ${midiToName(minimumSpectrumMidi)} to ${midiToName(maximumSpectrumMidi - 1)}. Relative note strengths: ${likelyNoteLabel}.`
      : `Horizontal piano keyboard from ${midiToName(minimumSpectrumMidi)} to ${midiToName(maximumSpectrumMidi - 1)}.`);
    elements.keyboard.setAttribute('aria-valuenow', String(keyboardSelectedMidi));
    elements.keyboard.setAttribute('aria-valuetext', midiToName(keyboardSelectedMidi));

    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    for (let midi = minimumSpectrumMidi; midi < maximumSpectrumMidi; midi += 1) {
      if (isBlackKey(midi)) continue;
      const whiteIndex = whiteKeysBefore(midi);
      const x = whiteIndex * whiteKeyWidth;
      const likelyNote = likelyNotesByMidi.get(midi);
      context.fillStyle = '#f6f6f6';
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

      if (midi % 12 === 0 || midi === minimumSpectrumMidi || midi === maximumSpectrumMidi - 1) {
        context.fillStyle = '#171717';
        context.font = '700 11px "Familjen Grotesk", Arial, sans-serif';
        context.textBaseline = 'bottom';
        context.fillText(midiToName(midi), x + 2, height - 5);
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
    interaction(chordsEnabled ? 'chords_enabled' : 'chords_disabled');
    chordToggle.setAttribute('aria-pressed', String(chordsEnabled));
    chordToggle.classList.toggle('is-active', chordsEnabled);
    chordToggle.querySelector('strong').textContent = chordsEnabled ? 'On' : 'Off';
    chordReadout.hidden = !chordsEnabled;
    chordTracker.reset();
    chordReadout.replaceChildren();
    if (state.spectrogram?.evidence && chordsEnabled) renderChords(chordTracker.update(state.spectrogram.evidence.candidates, state.spectrogram.center, false, performance.now()));
    drawSpectrogram();
  });
  function renderChords(guesses) {
    if ([...chordReadout.children].map(node => node.textContent).join('\n') === guesses.join('\n')) return;
    chordReadout.replaceChildren(...guesses.map((guess, index) => {
      const node = document.createElement(index === 0 ? 'strong' : 'span');
      node.textContent = guess;
      return node;
    }));
  }

  function updateSpectrumNotes() {
    const { data, frames, rows } = state.spectrogram;
    const profile = state.spectrogram.profile || new Float32Array(rows);
    if (!state.spectrogram.profile) {
      for (let row = 0; row < rows; row += 1) {
        let sum = 0;
        for (let frame = 0; frame < frames; frame += 1) {
          const value = data[frame * rows + row];
          sum += value * value;
        }
        profile[row] = Math.sqrt(sum / frames);
      }
      state.spectrogram.profile = profile;
    }
    if (!state.spectrogram.tracked) {
      const evidence = state.spectrogram.evidence;
      const history = state.spectrumHistory;
      const elapsed = state.spectrogram.center - (history?.center ?? -Infinity);
      const continuous = !elements.audio.paused && elapsed > 0 && elapsed < .3;
      const live = !elements.audio.paused && !(elements.analyzeSelection.checked && hasSelection());
      if (chordsEnabled) renderChords(chordTracker.update(evidence.candidates, state.spectrogram.center, live, performance.now()));
      state.spectrogram.notes = noteTracker.update(evidence, detectionSettings, .45,
        state.spectrogram.center, performance.now(), live);
      state.spectrogram.reference = continuous
        ? Math.max(.0002, evidence.peak, history.reference * Math.exp(-elapsed / .4))
        : Math.max(.0002, evidence.peak);
      state.spectrogram.tracked = true;
      state.spectrumHistory = {center:state.spectrogram.center, reference:state.spectrogram.reference};
    }
    state.likelyNotes = state.spectrogram.notes;
    return profile;
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
      drawEmptyGuides(context, width, height, true);
      if (state.audioBuffer) context.fillText('Spectrum follows the playhead', 16, height / 2);
      drawKeyboard();
      return;
    }

    const { binsPerSemitone, minimumMidi, maximumMidi } = state.spectrogram;
    const profile = updateSpectrumNotes();
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
      if (midi < minimumSpectrumMidi || midi >= maximumSpectrumMidi) continue;
      const x = midiCenterToKeyboardX(midi, width);
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, height);
      context.stroke();
    }

    context.beginPath();
    let spectrumPathStarted = false;
    let spectrumLastY = 0;
    profile.forEach((value, row) => {
      const note = minimumMidi + row / binsPerSemitone;
      if (note < minimumSpectrumMidi || note > maximumSpectrumMidi - 0.5) return;
      const x = midiCenterToKeyboardX(minimumMidi + row / binsPerSemitone, width);
      const amplitude = Math.min(1, value / reference);
      const level = amplitude;
      const y = height - level * (height - 10) - 5;
      if (!spectrumPathStarted) context.moveTo(0, y);
      context.lineTo(x, y);
      spectrumLastY = y;
      spectrumPathStarted = true;
    });
    if (spectrumPathStarted) context.lineTo(width, spectrumLastY);
    context.strokeStyle = colors.text;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();

    const detectedMidi = state.likelyNotes.find(note => !note.releasing)?.preciseMidi;
    if (Number.isFinite(detectedMidi)) {
      const cursorX = midiCenterToKeyboardX(detectedMidi, width);
      context.strokeStyle = colors.accent;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cursorX, 0);
      context.lineTo(cursorX, height);
      context.stroke();
    }
    drawKeyboard();
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
    elements.loopBottom.disabled = !enabled;
    elements.selectionOnly.disabled = !enabled || !hasSelection();
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
    let stretchProcessorName = null;
    try {
      await state.audioContext.audioWorklet.addModule(new URL('vendor/phase-vocoder-processor.js?v=2.1.1', scriptUrl));
      stretchProcessorName = 'phase-vocoder-processor';
    } catch (error) {
      console.warn('Smooth pitch lock unavailable; trying the waveform stretcher.', error);
      try {
        await state.audioContext.audioWorklet.addModule(new URL('vendor/soundtouch-processor.js?v=2.1.1', scriptUrl));
        stretchProcessorName = 'soundtouch-processor';
      } catch (fallbackError) {
        console.warn('Enhanced pitch lock unavailable; using browser pitch preservation.', fallbackError);
      }
    }
    state.stretchProcessorName = stretchProcessorName;
    try {
      const smoothModule = await import(new URL('vendor/SignalsmithStretch.mjs?v=1.3.2', scriptUrl));
      state.smoothNode = await smoothModule.default(state.audioContext);
      state.smoothNode.schedule({ active: false });
    } catch (error) {
      console.warn('Direct audio stretching unavailable; using pitch-lock worklet.', error);
    }
    state.mediaSource = state.audioContext.createMediaElementSource(elements.audio);
    state.transportSink = state.audioContext.createGain();
    state.transportSink.gain.value = 0;
    state.highpassNode = state.audioContext.createBiquadFilter();
    state.highpassNode.type = 'highpass';
    state.lowpassNode = state.audioContext.createBiquadFilter();
    state.lowpassNode.type = 'lowpass';
    // Low/high-pass Q uses dB in Web Audio: Butterworth avoids resonant gain bumps.
    state.highpassNode.Q.value = state.lowpassNode.Q.value = 20 * Math.log10(Math.SQRT1_2);
    state.eqNodes = TranscribeEQ.connect(state.audioContext);
    state.pitchNode = new AudioWorkletNode(state.audioContext, 'transcribe-pitch-processor', {
      parameterData: { pitchFactor: 2 ** (pitchShiftCents() / 1200) }
    });
    if (stretchProcessorName) state.stretchNode = createStretchProcessor();
    state.pitchOutput = state.audioContext.createGain();
    state.splitterNode = state.audioContext.createChannelSplitter(2);
    state.leftGain = state.audioContext.createGain();
    state.rightGain = state.audioContext.createGain();
    state.mergerNode = state.audioContext.createChannelMerger(2);
    state.outputGain = state.audioContext.createGain();

    state.mediaSource.connect(state.highpassNode);
    // Keep the media element's transport clock rendering while direct PCM audio
    // replaces its audible output during slowed, pitch-locked playback.
    state.mediaSource.connect(state.transportSink);
    state.transportSink.connect(state.audioContext.destination);
    state.highpassNode.connect(state.lowpassNode);
    state.lowpassNode.connect(state.eqNodes[0]);
    state.pitchOutput.connect(state.splitterNode);
    updatePitchPreservation();
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
    [state.highpassNode, state.lowpassNode].forEach((node, index) => {
      const frequency = Number(index === 0 ? elements.highpass.value : elements.lowpass.value);
      const off = frequency === (index === 0 ? 20 : 20000);
      // A zero-gain peaking filter is unity: bypass completely at the outer edge.
      node.type = off ? 'peaking' : (index === 0 ? 'highpass' : 'lowpass');
      node.gain.value = 0;
      node.Q.value = off ? 1 : 20 * Math.log10(Math.SQRT1_2);
      node.frequency.setTargetAtTime(frequency, state.audioContext.currentTime, 0.01);
    });
  }

  function updateVolume() {
    if (state.outputGain) {
      state.outputGain.gain.setTargetAtTime(Number(elements.volume.value), state.audioContext.currentTime, 0.01);
    } else {
      elements.audio.volume = Number(elements.volume.value);
    }
  }

  function hasSelection() {
    return !marks?.rangeAnchor && state.loopStart !== null && state.loopEnd !== null && state.loopEnd - state.loopStart >= 0.04;
  }

  function selectionPlayback() {
    return Boolean(transport.range) || (state.selectionOnly && hasSelection());
  }

  function returnToStart() {
    transport.currentTime = selectionPlayback() ? state.loopStart : 0;
    syncSmoothPlayback();
    normalizeViewStart(transport.currentTime);
    renderAll();
    requestSpectrumAt(transport.currentTime, true);
  }

  function enforcePlaybackRange() {
    if (transport.pending) return;
    if (!selectionPlayback() || elements.audio.paused) return;
    if (transport.currentTime >= state.loopEnd) {
      if (state.loopEnabled) transport.currentTime = state.loopStart;
      else { elements.audio.pause(); transport.currentTime = state.loopEnd; }
    } else if (transport.currentTime < state.loopStart) {
      transport.currentTime = state.loopStart;
    }
  }

  function updateLoopControls() {
    stems?.selectionChanged();
    state.selectionOnly = Boolean(state.selectionOnly && hasSelection());
    elements.selectionOnly.disabled = !hasSelection() || Boolean(transport.range);
    elements.selectionOnly.classList.toggle('is-active', selectionPlayback());
    elements.selectionOnly.setAttribute('aria-pressed', String(selectionPlayback()));
    const startLabel = selectionPlayback() ? 'Return to selection start' : 'Return to track start';
    elements.start.dataset.tooltip = `${startLabel} (B)`;
    elements.start.setAttribute('aria-label', startLabel);
    const loopLabel = selectionPlayback() ? 'Loop selection' : 'Loop whole track';
    elements.loopBottom.dataset.tooltip = `${loopLabel} (R)`;
    elements.loopBottom.setAttribute('aria-label', loopLabel);
    state.loopEnabled = Boolean(state.loopEnabled && state.duration);
    elements.audio.loop = state.loopEnabled && (Boolean(transport.range) || !selectionPlayback());
    [elements.loopBottom].forEach((button) => {
      button.classList.toggle('is-active', state.loopEnabled);
      button.setAttribute('aria-pressed', String(state.loopEnabled));
    });
    elements.loopBottom.disabled = !state.duration;
    syncSmoothPlayback();
  }

  function setLoopEnabled(enabled) {
    state.loopEnabled = enabled;
    updateLoopControls();
  }

  function toggleLoop() {
    if (!state.duration) return;
    setLoopEnabled(!state.loopEnabled);
    interaction(state.loopEnabled ? 'loop_enabled' : 'loop_disabled');
    if (state.loopEnabled) window.siteAnalytics?.track('tool_action', 'transcribe', 'loop_enabled');
  }

  async function togglePlayback() {

    if (!state.duration) {
      return;
    }

    await initializeAudioGraph(true);
    if (transport.pending) { transport.pending.resume = !transport.pending.resume; return; }
    if (elements.audio.paused) {
      if (selectionPlayback() && (transport.currentTime < state.loopStart || transport.currentTime >= state.loopEnd)) {
        transport.currentTime = state.loopStart;
        // Complete the initial seek before starting playback.
        if (elements.audio.seeking) await new Promise(resolve => {
          const done = () => { clearTimeout(timer); elements.audio.removeEventListener('seeked', done); resolve(); };
          const timer = setTimeout(done, 1000);
          elements.audio.addEventListener('seeked', done, {once:true});
        });
      }
      try {
        await elements.audio.play();
        interaction('playback_started');
      } catch {
        window.siteAnalytics?.track('tool_error', 'transcribe', 'playback_failed');
      }
    } else {
      elements.audio.pause();
      interaction('playback_paused');
    }
  }

  function seekBy(seconds) {

    if (!state.duration) {
      return;
    }
    transport.currentTime = clamp(transport.currentTime + seconds, 0, state.duration);
    if (transport.currentTime < state.viewStart || transport.currentTime > state.viewStart + viewDuration()) {
      normalizeViewStart();
    }
    renderAll();
  }

  function setZoom(nextZoom) {
    if (!state.duration) {
      return;
    }
    state.zoom = clamp(nextZoom, 1, Math.max(32, state.duration / 24));
    normalizeViewStart();
    elements.zoom.setAttribute('aria-valuetext', `${Math.round(state.zoom * 100)}%`);
    renderAll();
  }

  function requestSpectrumAt(time, force = false) {
    // Periodic work follows wall time, independent of playback speed. Explicit
    // seeks/settings changes may bypass the cadence, but never the worker queue.
    if (document.hidden || document.getElementById('transcribe-analysis').hidden) return;
    if (force) { state.spectrumHistory = null; chordTracker.reset(); noteTracker.reset(); }
    if (!state.audioBuffer) {
      state.spectrogram = null;
      state.spectrumCursor = null;
      state.likelyNotes = [];
      resetPitchReadout();
      elements.frequencyReadout.textContent = '';
      drawSpectrogram();
      return;
    }

    const aggregate = elements.analyzeSelection.checked && hasSelection();
    const center = aggregate ? (state.loopStart + state.loopEnd) / 2 : clamp(time, 0, state.duration);
    const rangeKey = aggregate ? `${state.loopStart}:${state.loopEnd}` : 'moment';
    if (!force && aggregate && state.lastSpectrumRange === rangeKey) return;
    if (!force && elements.audio.paused && state.lastSpectrumRange === rangeKey && center === state.lastSpectrumTime) return;
    if (state.analysisInFlight) {
      state.pendingSpectrumTime = center;
      state.pendingSpectrumForce ||= force;
      state.spectrumRequestInvalidated ||= force;
      return;
    }
    const now = performance.now();
    // A small tolerance absorbs animation-frame jitter on 60/120 Hz displays.
    if (!force && now + 1 < state.nextSpectrumUpdateAt) return;
    const next = state.nextSpectrumUpdateAt || now;
    state.nextSpectrumUpdateAt = force || now - next >= spectrumUpdateIntervalMs
      ? now + spectrumUpdateIntervalMs : next + spectrumUpdateIntervalMs;
    state.pendingSpectrumTime = null;
    state.pendingSpectrumForce = false;
    state.spectrumRequestInvalidated = false;

    const windowDuration = Math.min(spectrumWindowSeconds, state.duration);
    const start = aggregate ? state.loopStart : clamp(center - windowDuration / 2, 0, Math.max(0, state.duration - windowDuration));
    const end = aggregate ? state.loopEnd : Math.min(state.duration, start + windowDuration);
    state.lastSpectrumRange = rangeKey;
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
      frames: 1,
      detectionMode: detectionSettings.mode,
      noteTolerance: .45,
      aggregate
    });
  }

  function setSelection(start, end, shouldAnalyze = true, seekToStart = true) {
    if (marks) marks.rangeAnchor = null;
    state.loopStart = clamp(Math.min(start, end), 0, state.duration);
    state.loopEnd = clamp(Math.max(start, end), 0, state.duration);
    const duration = state.loopEnd - state.loopStart;
    stems?.selectionChanged();

    if (duration < 0.04) {
      state.loopStart = null;
      state.loopEnd = null;
      state.loopEnabled = false;
      elements.selectionStatus.textContent = '';
    } else {
      if (seekToStart) { state.selectionOnly = true; transport.currentTime = state.loopStart; }
      elements.selectionStatus.textContent = '';
    }

    updateLoopControls();
    renderAll();
    if (shouldAnalyze) {
      requestSpectrumAt(transport.currentTime, true);
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
  const configFields = ['channel', 'highpass', 'lowpass', 'semitones', 'cents', 'volume'];


  // Store the original audio only when a recording changes; config writes stay small.
  let sessionFile = null, sessionRevision = 0, sessionAudioSaved = false;
  let savedSessionJSON = null, sessionSaving = false, retrySaveAfter = 0;
  let sessionSaveDisabled = false, sessionWrite = Promise.resolve();
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
    if (sessionSaveDisabled || !sessionFile || !marks.identity || sessionSaving || Date.now() < retrySaveAfter) return;
    const config = captureConfig(), json = JSON.stringify(config);
    if (json === savedSessionJSON) return;
    const revision = sessionRevision, file = sessionFile, includeAudio = !sessionAudioSaved;
    sessionSaving = true;
    try {
      sessionWrite = sessionStorage('readwrite', store => {
        if (includeAudio) store.put(file, 'audio');
        store.put(config, 'config');
      });
      await sessionWrite;
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
      if (!sessionSaveDisabled && sessionFile && JSON.stringify(captureConfig()) !== savedSessionJSON && Date.now() >= retrySaveAfter) saveSession();
    }
  }
  let loadingGeneration = null;
  let loadingFade = null;
  let loadingFinishing = false;
  function beginLoading(generation, name) {
    loadingFade?.cancel();
    loadingFade = null;
    loadingFinishing = false;
    loadingGeneration = generation;
    elements.loadingStage.textContent = 'Opening audio';
    elements.loadingFile.textContent = name;
    elements.loading.hidden = false;
    app.setAttribute('data-loading', '');
  }
  function finishLoading(generation) {
    if (generation !== loadingGeneration || loadingFinishing) return;
    loadingFinishing = true;
    // Paint the completed workspace before exposing it beneath the loader.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation !== loadingGeneration) return;
      app.removeAttribute('data-loading');
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        elements.loading.hidden = true;
        return;
      }
      loadingFade = elements.loading.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 180, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards'
      });
      loadingFade.finished.then(() => {
        if (generation !== loadingGeneration) return;
        elements.loading.hidden = true;
        loadingFade.cancel();
        loadingFade = null;
      }).catch(() => {}); // A replacement file cancels the previous reveal.
    }));
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
    } finally {
      if (revision === sessionRevision) finishLoading(null);
    }
  }

  function captureConfig() {
    return {
      format: 'transcribe-config', version: 1,
      audio: { name: elements.fileName.textContent, identity: marks.identity },
      annotations: marks.document(),
      settings: {
        ...Object.fromEntries(configFields.map(key => [key, elements[key].value])),
        analyzeSelection: elements.analyzeSelection.checked,
        detection: structuredClone(detectionSettings),
        speed: elements.audio.playbackRate, pitchLock: elements.pitchLock.getAttribute('aria-pressed') === 'true',
        zoom: state.zoom, viewStart: state.viewStart,
        loopStart: marks.rangeAnchor ? null : state.loopStart, loopEnd: marks.rangeAnchor ? null : state.loopEnd, loopEnabled: marks.rangeAnchor ? false : state.loopEnabled,
        selectionOnly: marks.rangeAnchor ? false : state.selectionOnly,
        spectrumScroll: state.spectrumScrollProgress, viewMode: app.dataset.viewMode,
        controlsOpen: sidebarOpen,
        eq: TranscribeEQ.settings(),
        stems: stems?.settings()
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
    for (const [key, min, max] of [['speed', .25, 2], ['zoom', 1, Math.max(32, state.duration / 24)], ['viewStart', 0, state.duration], ['spectrumScroll', 0, 1]]) {
      if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) invalid();
    }
    for (const key of ['pitchLock', 'loopEnabled', 'controlsOpen']) if (typeof settings[key] !== 'boolean') invalid();
    if (settings.analyzeSelection !== undefined && typeof settings.analyzeSelection !== 'boolean') invalid();
    if (settings.selectionOnly !== undefined && typeof settings.selectionOnly !== 'boolean') invalid();
    if (settings.eq !== undefined && !TranscribeEQ.valid(settings.eq)) invalid();
    if (settings.stems !== undefined) {
      if (!settings.stems || typeof settings.stems.enabled !== 'boolean' || !settings.stems.stems) invalid();
      if (settings.stems.scope !== undefined && !['highlight', 'song'].includes(settings.stems.scope)) invalid();
      for (const name of TranscribeStemAudio.names) if (typeof settings.stems.stems[name] !== 'boolean') invalid();
    }
    if (!['timeline', 'analysis'].includes(settings.viewMode)) invalid();
    if (!(settings.loopStart === null && settings.loopEnd === null) && (!Number.isFinite(settings.loopStart) || !Number.isFinite(settings.loopEnd) || settings.loopStart < 0 || settings.loopEnd > state.duration || settings.loopEnd - settings.loopStart < .04)) invalid();
    return { annotations, settings: {...settings, detection: TranscribeNotes.validate(settings.detection)} };
  }

  function applyConfig({ annotations, settings: saved }) {
    elements.audio.pause();
    if (transport.pending) transport.pending.resume = false;
    stems?.reset();
    marks.rangeAnchor = null;
    marks.clearImport();
    marks.change(() => { marks.doc = annotations; marks.selected = null; });
    for (const key of configFields) elements[key].value = saved[key];
    TranscribeEQ.restore(saved.eq);
    detectionSettings = TranscribeNotes.validate(saved.detection);
    syncDetectionControls();
    elements.analyzeSelection.checked = saved.analyzeSelection ?? false;
    updateAnalyzeSelectionToggle();
    elements.semitonesNumber.value = saved.semitones;
    elements.centsNumber.value = saved.cents;
    setPlaybackSpeed(saved.speed);
    closeCustomSpeedControl();
    elements.pitchLock.setAttribute('aria-pressed', String(saved.pitchLock));
    elements.pitchLock.classList.toggle('is-active', saved.pitchLock);
    elements.pitchLock.querySelector('strong').textContent = saved.pitchLock ? 'On' : 'Off';
    updatePitchPreservation();
    state.loopStart = saved.loopStart;
    state.loopEnd = saved.loopEnd;
    state.loopEnabled = saved.loopEnabled;
    state.selectionOnly = saved.selectionOnly ?? (saved.loopEnabled && saved.loopStart !== null);
    if (saved.loopStart !== null) setSelection(saved.loopStart, saved.loopEnd, false, false);
    else elements.selectionStatus.textContent = '';
    state.zoom = saved.zoom;
    elements.zoom.value = String(saved.zoom <= 16 ? (saved.zoom - 1) / 15 * 50 : 50 + (saved.zoom - 16) / (Math.max(32, state.duration / 24) - 16) * 50);
    elements.zoom.setAttribute('aria-valuetext', `${Math.round(saved.zoom * 100)}%`);
    state.viewStart = saved.viewStart;
    normalizeViewStart();
    app.dataset.viewMode = saved.viewMode;
    elements.viewButtons.forEach(button => {
      const active = button.dataset.viewMode === saved.viewMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    controlsPanel.hidden = true;
    updateSections();
    stems?.restore(saved.stems);
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
    window.siteAnalytics?.track('tool_export', 'transcribe', 'json');
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
      window.siteAnalytics?.track('tool_action', 'transcribe', 'config_imported');
      window.siteAnalytics?.track('tool_complete', 'transcribe', 'config_imported');
    } catch (error) {
      if (generation === marks.generation) window.siteAnalytics?.track('tool_error', 'transcribe', 'config_import_failed');
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

    sessionSaveDisabled = false; marks.persistenceDisabled = false;
    stopSelectionScroll();
    clearWaveformHoverGuide();
    state.dragging = null;
    stems?.reset(false);
    transport.reset();
    worker.postMessage({ type: 'stem-overlay', samples: null });
    state.smoothRevision += 1;
    state.smoothReady = false;
    if (state.smoothNode) state.smoothNode.schedule({ active: false });
    if (state.smoothEnabled) updatePitchPreservation();
    state.audioBuffer = null;
    state.duration = 0;
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
    // Replacing src can discard the old source's queued pause event.
    syncPlaybackButton();
    state.fileUrl = URL.createObjectURL(file);
    elements.audio.src = state.fileUrl;
    elements.fileName.textContent = file.name;
    elements.fileName.title = `${file.name} — Open a new audio file`;
    elements.localStatus.textContent = 'Decoding';
    elements.empty.hidden = true;
    beginLoading(loadGeneration, file.name);
    elements.selectionStatus.textContent = '';
    setControlsEnabled(false);

    try {
      await initializeAudioGraph();
      const buffer = await file.arrayBuffer();
      const decoded = await state.audioContext.decodeAudioData(buffer.slice(0));
      if (loadGeneration !== marks.generation) return;
      state.audioBuffer = decoded;
      elements.loadingStage.textContent = 'Preparing waveform';
      state.duration = state.audioBuffer.duration;
      prepareSmoothTrack(decoded, state.smoothRevision);
      const marksReady = marks.load(buffer);
      state.zoom = Math.max(1, state.duration / (mobileWorkspace.matches ? 15 : 24));
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
        generation: loadGeneration,
        samples,
        sampleRate: state.audioBuffer.sampleRate,
        bucketCount: 32768
      }, [samples.buffer]);

      elements.localStatus.textContent = 'Local';
      elements.audioFormat.textContent = `${(state.audioBuffer.sampleRate / 1000).toFixed(1)} kHz · ${state.audioBuffer.numberOfChannels === 1 ? 'Mono' : `${state.audioBuffer.numberOfChannels} channels`} · local`;
      elements.selectionStatus.textContent = '';
      elements.zoom.value = String(state.zoom <= 16 ? (state.zoom - 1) / 15 * 50 : 50 + (state.zoom - 16) / (Math.max(32, state.duration / 24) - 16) * 50);
      elements.zoom.setAttribute('aria-valuetext', `${Math.round(state.zoom * 100)}%`);
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
        if (!restoredConfig) {
          window.siteAnalytics?.track('tool_action', 'transcribe', 'audio_loaded');
          window.siteAnalytics?.track('tool_complete', 'transcribe', 'audio_loaded');
        }
        sessionFile = file;
        savedSessionJSON = null;
        sessionAudioSaved = Boolean(restoredConfig);
        saveSession();
      }
    } catch (error) {
      if (loadGeneration !== marks.generation) return;
      finishLoading(loadGeneration);
      window.siteAnalytics?.track('tool_error', 'transcribe', 'audio_load_failed');
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

  function stopSelectionScroll() {
    cancelAnimationFrame(state.dragScrollFrame);
    state.dragScrollFrame = null;
    state.dragScrollTime = null;
  }

  function timelineEdgeDirection(clientX) {
    const rect = elements.waveform.getBoundingClientRect();
    const x = clientX - rect.left;
    const edge = Math.min(48, rect.width / 5);
    return x < edge ? -clamp((edge - x) / edge, 0, 1)
      : x > rect.width - edge ? clamp((x - rect.width + edge) / edge, 0, 1) : 0;
  }

  function stopHoverScroll() {
    cancelAnimationFrame(state.hoverScrollFrame);
    state.hoverScrollFrame = null;
    state.hoverScrollTime = null;
  }

  function clearWaveformHoverGuide() {
    stopHoverScroll();
    state.hoverPointerX = null;
    elements.waveformHoverGuide.hidden = true;
  }

  function scrollHoverAtEdge(timestamp) {
    if (state.hoverPointerX === null || state.dragging || marks?.drag || timelineTouchBlocked || !state.duration || state.zoom <= 1) {
      stopHoverScroll();
      return;
    }
    const direction = timelineEdgeDirection(state.hoverPointerX);
    if (!direction) { stopHoverScroll(); return; }
    const elapsed = state.hoverScrollTime === null ? 0 : Math.min(0.05, (timestamp - state.hoverScrollTime) / 1000);
    state.hoverScrollTime = timestamp;
    if (elapsed) {
      const before = state.viewStart;
      setTimelineViewStart(before + direction * viewDuration() * 0.75 * elapsed);
      if (state.viewStart === before) { stopHoverScroll(); return; }
      if (marks?.rangeAnchor) {
        const { x, width } = waveformPointerPosition({ clientX: state.hoverPointerX });
        marks.previewRange(xToTime(x, width));
      }
    }
    state.hoverScrollFrame = requestAnimationFrame(scrollHoverAtEdge);
  }

  function startHoverScroll() {
    if (state.hoverScrollFrame === null && state.hoverPointerX !== null && !state.dragging && !marks?.drag && state.zoom > 1 && timelineEdgeDirection(state.hoverPointerX)) {
      state.hoverScrollFrame = requestAnimationFrame(scrollHoverAtEdge);
    }
  }

  function updateWaveformHoverGuide(event) {
    if (event.pointerType === 'touch' || !state.duration || timelineTouchBlocked) {
      clearWaveformHoverGuide();
      return;
    }
    const rect = elements.waveform.getBoundingClientRect();
    state.hoverPointerX = event.clientX;
    elements.waveformHoverGuide.style.left = `${clamp(event.clientX - rect.left, 0, Math.max(0, rect.width - 1))}px`;
    elements.waveformHoverGuide.hidden = false;
    if (state.dragging) stopHoverScroll();
    else startHoverScroll();
  }

  function scrollSelectionAtEdge(timestamp) {
    if (!state.dragging) { stopSelectionScroll(); return; }
    const elapsed = state.dragScrollTime === null ? 0 : Math.min(0.05, (timestamp - state.dragScrollTime) / 1000);
    state.dragScrollTime = timestamp;
    if (state.dragMoved && state.dragging !== 'pending') {
      const direction = timelineEdgeDirection(state.dragPointerX);
      const before = state.viewStart;
      if (direction) {
        setTimelineViewStart(before + direction * viewDuration() * 0.75 * elapsed);
        if (state.viewStart !== before) handleWaveformPointerMove({ clientX: state.dragPointerX });
      }
    }
    state.dragScrollFrame = requestAnimationFrame(scrollSelectionAtEdge);
  }

  let timelineTouchPan = null;
  let timelineTouchSelection = null;
  let timelineTouchBlocked = false;

  function timelineTouchCenter(touches) {
    return (touches[0].clientX + touches[1].clientX) / 2;
  }

  function startTimelineTouchPan(touches) {
    timelineTouchBlocked = true;
    stopSelectionScroll();
    clearWaveformHoverGuide();
    if (state.dragging) {
      state.dragging = null;
      if (timelineTouchSelection) {
        state.loopStart = timelineTouchSelection.start;
        state.loopEnd = timelineTouchSelection.end;
        stems?.selectionChanged();
        updateLoopControls();
        renderAll();
      }
    }
    timelineTouchPan = { x: timelineTouchCenter(touches), viewStart: state.viewStart };
  }

  function handleWaveformTouchStart(event) {
    clearWaveformHoverGuide();
    if (event.touches.length === 1 && !timelineTouchBlocked) {
      timelineTouchSelection = { start: state.loopStart, end: state.loopEnd };
    } else if (event.touches.length >= 2 && !timelineTouchPan) {
      startTimelineTouchPan(event.touches);
    }
  }

  function handleWaveformTouchMove(event) {
    if (event.touches.length < 2) {
      timelineTouchPan = null;
      return;
    }
    if (!timelineTouchPan) startTimelineTouchPan(event.touches);
    if (!state.duration || state.zoom <= 1) return;
    if (event.cancelable) event.preventDefault();
    const delta = timelineTouchCenter(event.touches) - timelineTouchPan.x;
    setTimelineViewStart(timelineTouchPan.viewStart - (delta / Math.max(1, elements.waveform.clientWidth)) * viewDuration());
  }

  function handleWaveformTouchEnd(event) {
    if (event.touches.length < 2) timelineTouchPan = null;
    if (!event.touches.length) {
      timelineTouchBlocked = false;
      timelineTouchSelection = null;
    }
  }

  function handleWaveformPointerDown(event) {
    if (!state.duration || event.button !== 0 || timelineTouchBlocked || (event.pointerType === 'touch' && !event.isPrimary)) {
      return;
    }

    const { x, width } = waveformPointerPosition(event);
    const time = xToTime(x, width);
    if (event.shiftKey || marks.rangeAnchor) {
      event.preventDefault();
      marks.rangePoint(time);
      if (marks.rangeAnchor) updateWaveformHoverGuide(event);
      return;
    }
    marks.rangeAnchor = null;
    const boundaryThreshold = (9 / width) * viewDuration();

    if (state.loopStart !== null && Math.abs(time - state.loopStart) < boundaryThreshold) {
      state.dragging = 'start';
    } else if (state.loopEnd !== null && Math.abs(time - state.loopEnd) < boundaryThreshold) {
      state.dragging = 'end';
    } else {
      state.dragging = 'pending';
    }

    stems?.selectionChanged();
    state.dragOriginX = x;
    state.dragPointerX = event.clientX;
    state.dragMoved = false;
    stopSelectionScroll();
    stopHoverScroll();
    state.dragScrollFrame = requestAnimationFrame(scrollSelectionAtEdge);
    elements.waveform.setPointerCapture(event.pointerId);
    drawWaveform();
  }

  function handleWaveformPointerMove(event) {
    if (timelineTouchBlocked) return;
    if (marks.rangeAnchor) {
      const { x, width } = waveformPointerPosition(event);
      marks.previewRange(xToTime(x, width));
      return;
    }
    if (!state.dragging) {
      return;
    }

    state.dragPointerX = event.clientX;
    const { x, width } = waveformPointerPosition(event);
    if (Math.abs(x - state.dragOriginX) >= 4) state.dragMoved = true;
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
    stopSelectionScroll();
    if (timelineTouchBlocked) return;
    if (!state.dragging) {
      return;
    }

    // A fast release can arrive before the final pointermove. Commit its
    // coordinates first, including a drag that is still marked as pending.
    if (event.type !== 'pointercancel') handleWaveformPointerMove(event);

    const { x, width } = waveformPointerPosition(event);
    const moved = Math.abs(x - state.dragOriginX);
    const pending = state.dragging === 'pending';
    state.dragging = null;

    if (pending || (!state.dragMoved && moved < 4)) {
      const time = xToTime(x, width);
      interaction('waveform_seek');
      if (hasSelection()) interaction('selection_cleared');
      transport.currentTime = time;
      state.loopStart = null;
      state.loopEnd = null;
      state.loopEnabled = false;
      setSelection(0, 0);
      renderAll();
      return;
    }

    setSelection(state.loopStart, state.loopEnd);
    setLoopEnabled(true);
    if (event.type !== 'pointercancel') interaction('selection_changed');
  }

  function updateOverviewDrag(event) {
    if (marks.rangeAnchor && state.duration) {
      const rect = elements.overview.getBoundingClientRect();
      marks.previewRange((event.clientX - rect.left) / rect.width * state.duration);
      return;
    }
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
    if ((event.shiftKey || marks.rangeAnchor) && event.button === 0) { event.preventDefault(); marks.rangePoint(x / rect.width * state.duration); return; }
    const viewportX = (state.viewStart / state.duration) * rect.width;
    const viewportWidth = (viewDuration() / state.duration) * rect.width;
    const insideViewport = x >= viewportX && x <= viewportX + viewportWidth;
    state.overviewDrag = {
      offsetX: insideViewport ? x - viewportX : viewportWidth / 2,
      pointerId: event.pointerId
    };
    elements.overview.setPointerCapture(event.pointerId);
    if (!insideViewport) {
      transport.currentTime = clamp((x / rect.width) * state.duration, 0, state.duration);
    }
    updateOverviewDrag(event);
  }

  function finishOverviewDrag(event) {
    if (!state.overviewDrag) return;
    if (elements.overview.hasPointerCapture(event.pointerId)) elements.overview.releasePointerCapture(event.pointerId);
    state.overviewDrag = null;
    if (event.type === 'pointerup') interaction('overview_navigated');
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
      minimumSpectrumMidi - 0.5,
      maximumSpectrumMidi - 0.5
    );
    updatePitchReadout(time, midi);
    drawSpectrogram();
  }

  function updatePlaybackFrame() {

    updateTimecode();

    enforcePlaybackRange();

    if (!state.dragging && state.zoom > 1 && transport.currentTime > state.viewStart + viewDuration() * 0.92) {
      normalizeViewStart(transport.currentTime);
      syncTimelineScroll();
      drawOverview();
    }

    drawWaveform();
    // Paint release against wall time even when a slow worker skips updates.
    if (state.likelyNotes.some(note => note.releasing)) {
      const now = performance.now();
      state.likelyNotes = state.likelyNotes.filter(note => TranscribeNotes.highlightStrength(note, now) > 0);
      drawKeyboard();
    }
    requestSpectrumAt(transport.currentTime);
    if (!elements.audio.paused) {
      state.animationFrame = requestAnimationFrame(updatePlaybackFrame);
    }
  }

  worker.addEventListener('message', (event) => {
    const message = event.data || {};

    if (message.type === 'peaks') {
      if (message.generation !== marks.generation) return;
      state.peaks = new Float32Array(message.peaks);
      renderAll();
      finishLoading(message.generation);
    }

    if (message.type === 'spectrogram' && message.id === state.analysisId) {
      state.analysisInFlight = false;
      if (document.hidden || document.getElementById('transcribe-analysis').hidden) {
        state.pendingSpectrumTime = null;
        state.pendingSpectrumForce = false;
        return;
      }
      if (state.spectrumRequestInvalidated) {
        state.spectrumRequestInvalidated = false;
        const pendingTime = state.pendingSpectrumTime;
        const pendingForce = state.pendingSpectrumForce;
        state.pendingSpectrumTime = null;
        state.pendingSpectrumForce = false;
        requestSpectrumAt(pendingTime ?? transport.currentTime, pendingForce);
        return;
      }
      state.spectrogram = {
        data: message.data,
        evidence: message.evidence,
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
      updateSpectrumNotes();
      const primaryNote = state.likelyNotes.find(note => !note.releasing);
      if (primaryNote) {
        updatePitchReadout(message.center, primaryNote.preciseMidi);
      } else {
        state.spectrumCursor = null;
        resetPitchReadout();
      }
      drawSpectrogram();
      const likelyNames = state.likelyNotes.filter(note => !note.releasing).slice(0, 5).map((note) => midiToName(note.midi));
      elements.frequencyReadout.textContent = likelyNames.length
        ? `${formatTime(message.center)} · likely ${likelyNames.join(', ')} · relative`
        : `${formatTime(message.center)} · no distinct peaks`;
      if (state.pendingSpectrumTime !== null) {
        const pendingTime = state.pendingSpectrumTime;
        const pendingForce = state.pendingSpectrumForce;
        state.pendingSpectrumTime = null;
        state.pendingSpectrumForce = false;
        requestSpectrumAt(elements.audio.paused ? pendingTime : transport.currentTime, pendingForce);
      }
    }
  });

  elements.fileName.addEventListener('click', () => elements.file.click());
  elements.file.addEventListener('change', () => loadFile(elements.file.files?.[0]));
  elements.speedButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const changed = elements.audio.playbackRate !== Number(button.dataset.speed);
      setPlaybackSpeed(Number(button.dataset.speed));
      if (changed && state.duration) interaction('preset_speed_changed');
      if (state.duration) window.siteAnalytics?.track('tool_action', 'transcribe', 'speed_changed');
    });
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
    updatePitchPreservation();
    interaction(enabled ? 'pitch_lock_enabled' : 'pitch_lock_disabled');
  });
  for (const input of [elements.semitones, elements.semitonesNumber, elements.cents, elements.centsNumber]) {
    input.addEventListener('change', () => {
      if (state.duration) {
        window.siteAnalytics?.track('tool_action', 'transcribe', 'pitch_changed');
        interaction('pitch_changed');
      }
    });
  }
  connectPitchControl(elements.semitones, elements.semitonesNumber);
  connectPitchControl(elements.cents, elements.centsNumber);
  elements.loopBottom.addEventListener('click', toggleLoop);
  elements.selectionOnly.addEventListener('click', () => {
    if (!hasSelection()) return;
    state.selectionOnly = !state.selectionOnly;
    interaction(state.selectionOnly ? 'selection_only_enabled' : 'selection_only_disabled');
    updateLoopControls();
    if (state.selectionOnly && (transport.currentTime < state.loopStart || transport.currentTime >= state.loopEnd)) returnToStart();
  });
  elements.audio.addEventListener('timeupdate', enforcePlaybackRange);
  elements.channel.addEventListener('change', reconnectChannels);
  elements.highpass.addEventListener('change', updateFilters);
  elements.lowpass.addEventListener('change', updateFilters);
  function updateAnalyzeSelectionToggle() {
    const enabled = Boolean(elements.analyzeSelection.checked);
    elements.analyzeSelection.setAttribute('aria-pressed', String(enabled));
    elements.analyzeSelection.classList.toggle('is-active', enabled);
    elements.analyzeSelection.querySelector('strong').textContent = enabled ? 'On' : 'Off';
  }
  elements.analyzeSelection.checked = false;
  elements.analyzeSelection.addEventListener('click', () => {
    elements.analyzeSelection.checked = !elements.analyzeSelection.checked;
    interaction(elements.analyzeSelection.checked ? 'selection_analysis_enabled' : 'selection_analysis_disabled');
    updateAnalyzeSelectionToggle();
    requestSpectrumAt(transport.currentTime, true);
  });
  function syncDetectionControls() {
    elements.detectionMode.value = detectionSettings.mode;
    elements.detectionMode.dataset.tooltip = {
      balanced: 'Moderate detection of several well-supported notes',
      bass: 'Follow a strong low note, with fewer overtone highlights',
      chordal: 'Show more independently supported notes in a voicing',
      melody: 'Follow up to three melody or harmony lines; leave rests blank'
    }[detectionSettings.mode];
    const range = detectionSettings.ranges[detectionSettings.mode];
    for (const [input, midi] of [[elements.detectionLow, range.low], [elements.detectionHigh, range.high]]) {
      input.value = midiToName(midi).replace('♯', '#');
      input.setCustomValidity('');
      input.removeAttribute('aria-invalid');
    }
  }
  function refreshDetection() {
    noteTracker.reset(); chordTracker.reset(); state.spectrumHistory = null;
    state.likelyNotes = [];
    state.spectrumCursor = null;
    resetPitchReadout();
    if (state.spectrogram) { state.spectrogram.notes = []; state.spectrogram.tracked = true; }
    drawSpectrogram();
    elements.frequencyReadout.textContent = state.audioBuffer ? 'Detecting notes…' : '';
    requestSpectrumAt(transport.currentTime, true);
  }
  syncDetectionControls();
  elements.detectionMode.addEventListener('change', () => {
    const mode = elements.detectionMode.value;
    detectionSettings.mode = mode;
    interaction(`detection_${mode}_selected`);
    detectionSettings.ranges[mode] = {...TranscribeNotes.defaults().ranges[mode]};
    syncDetectionControls(); refreshDetection();
  });
  for (const [input, endpoint] of [[elements.detectionLow, 'low'], [elements.detectionHigh, 'high']]) {
    const commit = (report = false) => {
      const midi = TranscribeNotes.parseNoteName(input.value);
      if (midi === null || midi < minimumSpectrumMidi || midi >= maximumSpectrumMidi) {
        input.setCustomValidity('Use a note from C1 to B6, such as C#6.');
        input.setAttribute('aria-invalid', 'true');
        window.siteAnalytics?.track('tool_error', 'transcribe', 'detection_range_invalid');
        if (report) input.reportValidity();
        return;
      }
      const range = detectionSettings.ranges[detectionSettings.mode];
      const changed = range[endpoint] !== midi;
      range[endpoint] = midi;
      if (changed) interaction('detection_range_changed');
      if (endpoint === 'low') range.high = Math.max(range.high, midi);
      else range.low = Math.min(range.low, midi);
      syncDetectionControls(); refreshDetection();
    };
    input.addEventListener('input', () => { input.setCustomValidity(''); input.removeAttribute('aria-invalid'); });
    input.addEventListener('change', () => commit());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); commit(true); }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); syncDetectionControls(); }
    });
  }
  elements.start.addEventListener('click', () => { returnToStart(); if (state.duration) interaction('return_to_start'); });
  elements.rewind.addEventListener('click', () => { seekBy(-5); if (state.duration) interaction('seek_backward'); });
  elements.play.addEventListener('click', togglePlayback);
  elements.forward.addEventListener('click', () => { seekBy(5); if (state.duration) interaction('seek_forward'); });
  elements.seek.addEventListener('input', () => {
    seekBy(Number(elements.seek.value) - transport.currentTime);
    requestSpectrumAt(transport.currentTime);
  });
  elements.volume.addEventListener('input', updateVolume);
  for (const [input, action] of [[elements.seek, 'seek_committed'], [elements.volume, 'volume_changed'], [elements.zoom, 'zoom_changed'], [elements.channel, 'channel_changed']]) {
    input.addEventListener('change', () => interaction(action));
  }
  elements.zoom.addEventListener('input', () => {
    const position = Number(elements.zoom.value);
    const zoom = position <= 50
      ? 1 + (position / 50) * 15
      : 16 + ((position - 50) / 50) * (Math.max(32, state.duration / 24) - 16);
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
  elements.waveform.addEventListener('pointermove', updateWaveformHoverGuide);
  elements.waveform.addEventListener('pointerleave', clearWaveformHoverGuide);
  elements.waveform.addEventListener('pointerup', handleWaveformPointerUp);
  elements.waveform.addEventListener('pointerup', startHoverScroll);
  elements.waveform.addEventListener('pointercancel', handleWaveformPointerUp);
  elements.waveform.addEventListener('pointercancel', clearWaveformHoverGuide);
  elements.waveform.addEventListener('touchstart', handleWaveformTouchStart, { passive: true });
  elements.waveform.addEventListener('touchmove', handleWaveformTouchMove, { passive: false });
  elements.waveform.addEventListener('touchend', handleWaveformTouchEnd, { passive: true });
  elements.waveform.addEventListener('touchcancel', handleWaveformTouchEnd, { passive: true });
  elements.waveform.addEventListener('lostpointercapture', () => {
    handleWaveformPointerUp({ clientX: state.dragPointerX });
  });
  const markRuler = document.getElementById('transcribe-mark-ruler');
  markRuler.addEventListener('pointermove', updateWaveformHoverGuide);
  markRuler.addEventListener('pointerleave', clearWaveformHoverGuide);
  markRuler.addEventListener('pointerdown', stopHoverScroll);
  markRuler.addEventListener('pointerup', startHoverScroll);
  markRuler.addEventListener('pointercancel', clearWaveformHoverGuide);
  window.addEventListener('blur', () => {
    stopSelectionScroll();
    clearWaveformHoverGuide();
    if (state.dragging) { state.dragging = null; setSelection(state.loopStart, state.loopEnd, true, false); }
  });
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
  let keyboardSelectedMidi = 60;
  const keyboardVoiceId = 'keyboard-audition';
  function selectKeyboardNote(midi) {
    stopKeyboardNote(keyboardVoiceId);
    keyboardSelectedMidi = clamp(midi, minimumSpectrumMidi, maximumSpectrumMidi - 1);
    drawKeyboard();
    const width = elements.keyboard.getBoundingClientRect().width;
    const x = midiCenterToKeyboardX(keyboardSelectedMidi, width);
    const viewport = elements.analysisGrid;
    if (x < viewport.scrollLeft || x > viewport.scrollLeft + viewport.clientWidth) {
      viewport.scrollLeft = clamp(x - viewport.clientWidth / 2, 0, viewport.scrollWidth - viewport.clientWidth);
    }
  }
  elements.keyboard.setAttribute('aria-valuemin', String(minimumSpectrumMidi));
  elements.keyboard.setAttribute('aria-valuemax', String(maximumSpectrumMidi - 1));
  elements.keyboard.addEventListener('focus', () => selectKeyboardNote(keyboardSelectedMidi));
  elements.keyboard.addEventListener('keydown', event => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -12, ArrowUp: 12 };
    if (!(event.key in steps) && !['Home', 'End', ' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key in steps) selectKeyboardNote(keyboardSelectedMidi + steps[event.key]);
    else if (event.key === 'Home') selectKeyboardNote(minimumSpectrumMidi);
    else if (event.key === 'End') selectKeyboardNote(maximumSpectrumMidi - 1);
    else if (!event.repeat) playKeyboardNote(keyboardSelectedMidi, keyboardVoiceId).catch(error => {
      stopKeyboardNote(keyboardVoiceId);
      console.error('Could not play keyboard note:', error);
    });
  });
  elements.keyboard.addEventListener('keyup', event => {
    if (![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    stopKeyboardNote(keyboardVoiceId);
  });
  elements.keyboard.addEventListener('blur', () => { stopKeyboardNote(keyboardVoiceId); drawKeyboard(); });
  elements.keyboard.style.touchAction = 'none';
  elements.keyboard.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const rect = elements.keyboard.getBoundingClientRect();
    const midi = keyboardNoteAt(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
    if (midi === null) return;
    event.preventDefault();
    elements.keyboard.setPointerCapture(event.pointerId);
    playKeyboardNote(midi, event.pointerId).catch((error) => {
      stopKeyboardNote(event.pointerId);
      console.error('Could not play keyboard note:', error);
    });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    elements.keyboard.addEventListener(type, (event) => stopKeyboardNote(event.pointerId));
  }
  window.addEventListener('blur', stopKeyboardNotes);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopKeyboardNotes();
      state.pendingSpectrumTime = null;
    } else requestSpectrumAt(transport.currentTime, true);
  });

  let spectrumTouchPan = null;
  elements.spectrogram.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) { spectrumTouchPan = null; return; }
    spectrumTouchPan = {
      x: event.touches[0].clientX,
      scrollLeft: elements.analysisGrid.scrollLeft,
      moved: false
    };
  }, { passive: true });
  elements.spectrogram.addEventListener('touchmove', (event) => {
    if (!spectrumTouchPan || event.touches.length !== 1) return;
    const delta = event.touches[0].clientX - spectrumTouchPan.x;
    if (Math.abs(delta) >= 8) spectrumTouchPan.moved = true;
    if (!spectrumTouchPan.moved) return;
    if (event.cancelable) event.preventDefault();
    const maximumScroll = Math.max(0, elements.analysisGrid.scrollWidth - elements.analysisGrid.clientWidth);
    elements.analysisGrid.scrollLeft = clamp(spectrumTouchPan.scrollLeft - delta, 0, maximumScroll);
    updateSpectrumScrollState();
  }, { passive: false });
  elements.spectrogram.addEventListener('touchend', (event) => {
    if (!spectrumTouchPan || event.touches.length) return;
    if (!spectrumTouchPan.moved && event.changedTouches.length) {
      handleSpectrogramPointer(event.changedTouches[0]);
    }
    spectrumTouchPan = null;
  }, { passive: true });
  elements.spectrogram.addEventListener('touchcancel', () => { spectrumTouchPan = null; }, { passive: true });
  elements.spectrogram.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') handleSpectrogramPointer(event);
  });
  elements.spectrogram.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || (event.pointerType !== 'touch' && event.buttons === 1)) {
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

  function syncPlaybackButton() {
    const playing = !elements.audio.paused && !elements.audio.ended && !elements.audio.error;
    const label = playing ? 'Pause' : 'Play';
    elements.play.classList.toggle('is-playing', playing);
    elements.play.setAttribute('aria-label', label);
    elements.play.dataset.tooltip = label;
    if (!playing) cancelAnimationFrame(state.animationFrame);
    return playing;
  }

  elements.audio.addEventListener('emptied', syncPlaybackButton);
  elements.audio.addEventListener('error', syncPlaybackButton);
  elements.audio.addEventListener('play', () => {
    syncSmoothPlayback();
    if (!syncPlaybackButton()) return;
    window.siteAnalytics?.track('tool_action', 'transcribe', 'playback_started');
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = requestAnimationFrame(updatePlaybackFrame);
  });
  elements.audio.addEventListener('pause', () => {
    syncSmoothPlayback();
    syncPlaybackButton();
    renderAll();
    requestSpectrumAt(transport.currentTime, true);
  });
  elements.audio.addEventListener('ended', () => {
    if (selectionPlayback() && state.loopEnabled) {
      transport.currentTime = state.loopStart;
      elements.audio.play().catch(() => renderAll());
      return;
    }
    syncPlaybackButton();
    syncSmoothPlayback();
    updateTimecode();
  });
  elements.audio.addEventListener('seeked', () => {
    if (state.stretchEnabled) resetStretchProcessor();
    syncSmoothPlayback();
    renderAll();
    requestSpectrumAt(transport.currentTime, true);
  });

  elements.viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.viewMode;
      if (app.dataset.viewMode !== mode) interaction(`${mode}_view`);
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
    if (event.defaultPrevented || event.isComposing || marks.measurePanel?.contains(document.activeElement) || elements.workspace.hidden || document.activeElement?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      return;
    }

    if (marks.key(event)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === '?') {
      event.preventDefault();
      if (!event.repeat) toggleSection('shortcuts');
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (event.repeat) return;
      togglePlayback();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBy(event.shiftKey ? -5 : -2);
      if (!event.repeat && state.duration) interaction('seek_backward');
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(event.shiftKey ? 5 : 2);
      if (!event.repeat && state.duration) interaction('seek_forward');
    } else if (event.key === ',' || event.key === '.') {
      event.preventDefault();
      if (event.repeat) return;
      const speeds = elements.speedButtons.map((button) => Number(button.dataset.speed)).sort((a, b) => a - b);
      const current = elements.audio.playbackRate;
      const next = event.key === '.'
        ? speeds.find((speed) => speed > current)
        : speeds.reverse().find((speed) => speed < current);
      if (next !== undefined) { setPlaybackSpeed(next); interaction('preset_speed_changed'); }
    } else if (['-', '=', '+'].includes(event.key)) {
      event.preventDefault();
      if (elements.zoom.disabled) return;
      const direction = event.key === '-' ? -1 : 1;
      elements.zoom.value = String(clamp(Number(elements.zoom.value) + direction * 5, Number(elements.zoom.min), Number(elements.zoom.max)));
      elements.zoom.dispatchEvent(new Event('input', { bubbles: true }));
      if (!event.repeat) interaction('zoom_changed');
    } else if (event.key.toLowerCase() === 'c') {
      event.preventDefault();
      if (!event.repeat) toggleSection('settings');
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
      if (!event.repeat) spectrumCheckbox.click();
    } else if (event.key.toLowerCase() === 't') {
      event.preventDefault();
      if (!event.repeat) toggleSection('stems');
    } else if (event.key.toLowerCase() === 'b') {
      event.preventDefault();
      if (!event.repeat) elements.start.click();
    } else if (['r', 'l'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      if (!event.repeat) elements.loopBottom.click();
    } else if (event.key.toLowerCase() === 'h') {
      event.preventDefault();
      if (!event.repeat) elements.selectionOnly.click();
    } else if (event.key === '[' && state.duration) {
      setSelection(transport.currentTime, state.loopEnd ?? clamp(transport.currentTime + 2, 0, state.duration));
      if (!event.repeat) interaction('selection_changed');
    } else if (event.key === ']' && state.duration) {
      setSelection(state.loopStart ?? clamp(transport.currentTime - 2, 0, state.duration), transport.currentTime);
      if (!event.repeat) interaction('selection_changed');
    }
  });

  const controlsToggle = document.getElementById('transcribe-controls-toggle');
  const controlsPanel = document.getElementById('transcribe-controls-panel');
  // Move the existing controls without replacing their state or listeners.
  const sidebar = document.createElement('aside');
  sidebar.id = 'transcribe-sidebar';
  sidebar.className = 'transcribe-sidebar';
  sidebar.setAttribute('aria-label', 'Transcription controls');
  sidebar.hidden = true;
  elements.workspace.append(sidebar);
  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'transcribe-sidebar-header';
  const sidebarTitle = document.createElement('h2');
  sidebarTitle.textContent = 'Controls';
  const closeSidebar = document.createElement('button');
  closeSidebar.type = 'button';
  closeSidebar.textContent = 'Close';
  closeSidebar.setAttribute('aria-label', 'Close controls');
  sidebarHeader.append(sidebarTitle, closeSidebar);
  const sidebarScroll = document.createElement('div');
  sidebarScroll.className = 'transcribe-sidebar-scroll';
  sidebar.append(sidebarHeader, sidebarScroll);
  let sidebarOpen = false;
  let activeSidebar = null;
  const shortcutsToggle = document.createElement('button');
  shortcutsToggle.id = 'transcribe-shortcuts-toggle';
  shortcutsToggle.type = 'button';
  shortcutsToggle.setAttribute('aria-label', 'Keyboard shortcuts');
  shortcutsToggle.setAttribute('aria-keyshortcuts', 'Shift+/');
  shortcutsToggle.dataset.tooltip = 'Keyboard shortcuts (?)';
  shortcutsToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14"/><path d="M6 9h2m2 0h2m2 0h2m2 0h1M6 13h2m2 0h2m2 0h2m2 0h1M8 16h8"/></svg>';
  controlsToggle.after(shortcutsToggle);
  sidebar.classList.add('transcribe-flat-sidebar');
  sidebarScroll.classList.add('transcribe-controls-grid');
  sidebarScroll.id = 'transcribe-controls-content';
  const shortcutsPane = document.createElement('div');
  shortcutsPane.id = 'transcribe-shortcuts-content';
  shortcutsPane.className = 'transcribe-shortcuts-pane';
  shortcutsPane.hidden = true;
  sidebar.append(shortcutsPane);
  shortcutsToggle.setAttribute('aria-controls', shortcutsPane.id);
  function makeGroup(id, title, parent, selectors, reset = null) {
    const section = document.createElement('section');
    section.id = `transcribe-section-${id}`;
    section.className = 'transcribe-sidebar-section';
    const heading = document.createElement('h3');
    const label = document.createElement('span');
    label.textContent = title;
    heading.append(label);
    const content = document.createElement('div');
    content.id = `transcribe-${id}-contents`;
    content.className = 'transcribe-group-content';
    if (reset) {
      const button = id === 'eq' ? document.getElementById('transcribe-eq-reset') : document.createElement('button');
      button.type = 'button';
      button.className = 'transcribe-section-reset';
      button.textContent = 'Reset';
      button.setAttribute('aria-label', `Reset ${title} to default`);
      if (id !== 'eq') button.addEventListener('click', reset);
      heading.append(button);
    }
    selectors.forEach(selector => content.append(app.querySelector(selector)));
    section.append(heading, content);
    parent.append(section);
    return content;
  }
  function resetInputs(keys) {
    keys.forEach(key => {
      const input = elements[key];
      input.value = input.tagName === 'SELECT' ? ([...input.options].find(option => option.defaultSelected) || input.options[0]).value : input.defaultValue;
    });
  }
  function resetSection(id) {
    resettingControls = true;
    if (id === 'sound') {
      resetInputs(['channel','semitones','cents']);
      elements.semitonesNumber.value = elements.semitones.value;
      elements.centsNumber.value = elements.cents.value;
      elements.pitchLock.setAttribute('aria-pressed', 'true');
      elements.pitchLock.classList.add('is-active');
      elements.pitchLock.querySelector('strong').textContent = 'On';
      reconnectChannels(); updatePitchShift(); updatePitchPreservation();
    } else if (id === 'analysis') {
      detectionSettings = TranscribeNotes.defaults(); syncDetectionControls();
      if (chordsEnabled) chordToggle.click();
      elements.analyzeSelection.checked = false;
      updateAnalyzeSelectionToggle();
      spectrumCheckbox.checked = true;
      updateSpectrumVisibility();
      requestSpectrumAt(transport.currentTime, true);
    } else if (id === 'stems') stems.reset();
    resettingControls = false;
    interaction(`${id}_reset`);
    renderAll(); saveSession();
    showConfigStatus('Section settings reset to default.');
  }
  elements.channel.dataset.tooltip = 'Playback channel';
  const soundContents = makeGroup('sound', 'Sound', sidebarScroll, ['#transcribe-pitch-lock', '.transcribe-sound-controls', '.transcribe-audio-pitch'], () => resetSection('sound'));
  const analysisContents = makeGroup('analysis', 'Analysis', sidebarScroll, ['#transcribe-chords-toggle', '#transcribe-analyze-selection', '#transcribe-detection-controls'], () => resetSection('analysis'));
  makeGroup('eq', 'EQ', sidebarScroll, ['#transcribe-eq-panel'], () => {});
  makeGroup('stems', 'Stems', sidebarScroll, ['#transcribe-stems-panel'], () => resetSection('stems'));
  document.getElementById('transcribe-stems-panel').hidden = false;
  async function clearSavedConfigData(button) {
    if (!window.confirm('Clear all saved Transcribe data for every recording? This removes local marker autosaves, settings, and the cached recording. Your current work and exported files stay intact. Autosave resumes when you open audio again.')) return;
    button.disabled = true;
    sessionSaveDisabled = true;marks.persistenceDisabled = true;sessionRevision++;
    try {
      await Promise.allSettled([sessionWrite,marks.saveQueue]);
      await Promise.all([
        sessionStorage('readwrite', store => store.clear()),
        marks.storage('readwrite', store => store.clear())
      ]);
      for (const key of ['transcribe-sections','transcribe-sidebar-groups','transcribe-spectrum-visible']) localStorage.removeItem(key);
      window.siteAnalytics?.track('tool_complete', 'transcribe', 'saved_data_cleared');
      sessionAudioSaved = false;savedSessionJSON = null;
      elements.localStatus.textContent = 'Not autosaving';
      showConfigStatus('Saved Transcribe data cleared. Current work stays open; open audio again to resume autosave.');
    } catch { window.siteAnalytics?.track('tool_error', 'transcribe', 'saved_data_clear_failed'); showConfigStatus('Could not clear all saved data. Autosave is paused; try again.'); }
    finally { button.disabled = false; }
  }
  const deleteMeasures = document.createElement('button');
  deleteMeasures.id = 'transcribe-delete-measures';
  deleteMeasures.type = 'button';
  deleteMeasures.textContent = 'Delete measures';
  deleteMeasures.setAttribute('aria-label', 'Delete measure markers');
  deleteMeasures.disabled = true;
  deleteMeasures.dataset.tooltip = 'Delete measure markers; keep section starts. Supports Undo.';
  deleteMeasures.addEventListener('click', () => marks.deleteMeasures());
  marks.root.querySelector('fieldset').append(deleteMeasures);
  const footer = document.createElement('footer');
  footer.className = 'transcribe-sidebar-footer';
  footer.setAttribute('aria-label', 'Saved data');
  const dataActions = document.createElement('div');
  dataActions.className = 'transcribe-data-actions';
  const clearSaved = document.createElement('button');
  clearSaved.id = 'transcribe-clear-saved';
  clearSaved.type = 'button';
  clearSaved.textContent = 'Clear saved data';
  clearSaved.setAttribute('aria-label', 'Clear all saved config data');
  clearSaved.addEventListener('click', () => clearSavedConfigData(clearSaved));
  dataActions.append(clearSaved);
  footer.append(dataActions);
  app.querySelector('.transcribe-file-control').insertBefore(configActions, document.getElementById('transcribe-config-file'));
  sidebarScroll.append(footer);
  shortcutsPane.append(document.getElementById('transcribe-shortcuts'));
  const stemPanel = document.getElementById('transcribe-stems-panel');
  const stemInfo = document.createElement('div');
  stemInfo.id = 'transcribe-stems-info';
  stemInfo.setAttribute('popover', 'auto');
  stemInfo.setAttribute('role', 'note');
  stemInfo.setAttribute('aria-label', 'About stem separation');
  stemPanel.querySelectorAll('.transcribe-stems-help').forEach(help => stemInfo.append(help));
  const infoButton = document.createElement('button');
  infoButton.type = 'button';
  infoButton.className = 'transcribe-info-button';
  infoButton.setAttribute('popovertarget', stemInfo.id);
  infoButton.setAttribute('aria-label', 'About stem separation');
  infoButton.dataset.tooltip = 'About stem separation';
  infoButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg>';
  const stemActions = document.createElement('div');
  stemActions.className = 'transcribe-stems-actions';
  stemActions.append(document.getElementById('transcribe-stems-enabled'));
  stemPanel.prepend(stemActions);
  document.querySelector('#transcribe-section-stems > h3').append(infoButton);
  stemPanel.append(stemInfo);
  const shortcuts = document.getElementById('transcribe-shortcuts');
  shortcuts.querySelector('h2').hidden = true;
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  const appleKeyboard = /Mac|iPhone|iPad|iPod/i.test(platform);
  shortcuts.querySelectorAll('[data-platform-modifier]').forEach(key => { key.textContent = appleKeyboard ? 'Cmd' : 'Ctrl'; });
  shortcuts.querySelectorAll('[data-platform-alt]').forEach(key => { key.textContent = appleKeyboard ? 'Option' : 'Alt'; });

  const spectrumCheckbox = document.createElement('button');
  spectrumCheckbox.type = 'button';
  spectrumCheckbox.id = 'transcribe-spectrum-visible';
  spectrumCheckbox.className = 'transcribe-tool-toggle';
  spectrumCheckbox.innerHTML = '<span>Spectrum</span><strong>On</strong>';
  spectrumCheckbox.setAttribute('aria-label', 'Spectrum and keyboard');
  spectrumCheckbox.setAttribute('aria-controls', 'transcribe-analysis');
  spectrumCheckbox.setAttribute('aria-keyshortcuts', 'F');
  spectrumCheckbox.checked = true;
  try { spectrumCheckbox.checked = localStorage.getItem('transcribe-spectrum-visible') !== 'false'; } catch {}
  analysisContents.prepend(spectrumCheckbox);
  chordToggle.querySelector('span').textContent = 'Chords';
  chordToggle.setAttribute('aria-label', 'Chord guesses');
  const bandHeading = document.querySelector('.transcribe-eq-table thead th');
  if (bandHeading) { bandHeading.textContent = ''; bandHeading.setAttribute('aria-label', 'Band'); }
  function updateSpectrumVisibility() {
    spectrumCheckbox.setAttribute('aria-pressed', String(spectrumCheckbox.checked));
    spectrumCheckbox.classList.toggle('is-active', spectrumCheckbox.checked);
    spectrumCheckbox.querySelector('strong').textContent = spectrumCheckbox.checked ? 'On' : 'Off';
    document.getElementById('transcribe-analysis').hidden = !spectrumCheckbox.checked;
    elements.workspace.classList.toggle('spectrum-hidden', !spectrumCheckbox.checked);
    try { if (!sessionSaveDisabled) localStorage.setItem('transcribe-spectrum-visible', String(spectrumCheckbox.checked)); } catch {}
    requestAnimationFrame(resizeCanvases);
    if (spectrumCheckbox.checked) requestSpectrumAt(transport.currentTime, true);
    else state.pendingSpectrumTime = null;
  }
  spectrumCheckbox.addEventListener('click', () => { spectrumCheckbox.checked = !spectrumCheckbox.checked; interaction(spectrumCheckbox.checked ? 'spectrum_shown' : 'spectrum_hidden'); updateSpectrumVisibility(); });
  updateSpectrumVisibility();
  controlsPanel.replaceChildren();
  controlsPanel.hidden = true;
  controlsToggle.hidden = false;
  controlsToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6"/></svg>';
  controlsToggle.setAttribute('aria-label', 'Controls');
  controlsToggle.dataset.tooltip = 'Controls (C)';
  controlsToggle.title = 'Controls (C)';
  controlsToggle.setAttribute('aria-controls', sidebarScroll.id);
  closeSidebar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  document.getElementById('transcribe-stems-toggle').hidden = true;
  // Hints stay available without consuming permanent control space.
  function addGroupInfo(id, nodes, title) {
    const info = document.createElement('div');
    info.id = `transcribe-${id}-info`;
    info.setAttribute('popover', 'auto');
    info.setAttribute('role', 'note');
    info.setAttribute('aria-label', title);
    nodes.forEach(node => info.append(node));
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'transcribe-info-button';
    button.setAttribute('popovertarget', info.id);
    button.setAttribute('aria-label', title);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg>';
    document.getElementById(`transcribe-section-${id}`).querySelector('h3').append(button);
    sidebar.append(info);
  }
  addGroupInfo('eq', [...app.querySelectorAll('.transcribe-eq-hint')], 'Using the equalizer');
  const sidebarHelp = [...sidebar.querySelectorAll('.transcribe-info-button[popovertarget]')].map(button => {
    const info = document.getElementById(button.getAttribute('popovertarget'));
    info.classList.add('transcribe-anchored-info');
    function position() {
      if (!info.matches(':popover-open')) return;
      const anchor = button.getBoundingClientRect();
      const panel = info.getBoundingClientRect();
      const gap = 6, edge = 8;
      const left = clamp(anchor.right - panel.width, edge, Math.max(edge, innerWidth - panel.width - edge));
      let top = anchor.bottom + gap;
      if (top + panel.height > innerHeight - edge) top = anchor.top - panel.height - gap;
      info.style.left = `${left}px`;
      info.style.top = `${clamp(top, edge, Math.max(edge, innerHeight - panel.height - edge))}px`;
    }
    info.addEventListener('toggle', position);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, {capture: true, passive: true});
    new ResizeObserver(position).observe(info);
    return info;
  });
  function updateSections() {
    if (activeSidebar !== 'controls') sidebarHelp.forEach(info => { if (info.matches(':popover-open')) info.hidePopover(); });
    sidebarOpen = activeSidebar !== null;
    sidebar.hidden = !sidebarOpen;
    sidebarScroll.hidden = activeSidebar !== 'controls';
    shortcutsPane.hidden = activeSidebar !== 'shortcuts';
    sidebarTitle.textContent = activeSidebar === 'shortcuts' ? 'Keyboard shortcuts' : 'Controls';
    sidebar.setAttribute('aria-label', sidebarTitle.textContent);
    closeSidebar.setAttribute('aria-label', `Close ${activeSidebar === 'shortcuts' ? 'keyboard shortcuts' : 'controls'}`);
    controlsToggle.setAttribute('aria-expanded', String(activeSidebar === 'controls'));
    shortcutsToggle.setAttribute('aria-expanded', String(activeSidebar === 'shortcuts'));
    elements.workspace.classList.toggle('has-sidebar', sidebarOpen && !mobileWorkspace.matches);
    elements.workspace.classList.toggle('mobile-section-open', sidebarOpen && mobileWorkspace.matches);
    requestAnimationFrame(resizeCanvases);
  }
  function setSidebarView(view) {
    const previous = activeSidebar;
    const restoreFocus = sidebar.contains(document.activeElement);
    if (previous !== view) {
      if (previous) interaction(previous === 'shortcuts' ? 'shortcuts_closed' : 'controls_closed');
      if (view) interaction(view === 'shortcuts' ? 'shortcuts_opened' : 'controls_opened');
    }
    activeSidebar = view;
    updateSections();
    if (view && mobileWorkspace.matches) {
      requestAnimationFrame(() => {
        if (activeSidebar !== view) return;
        const workspace = elements.workspace;
        const top = sidebar.getBoundingClientRect().top - workspace.getBoundingClientRect().top;
        workspace.scrollTop += top;
      });
    }
    if (restoreFocus) {
      if (view) closeSidebar.focus();
      else (previous === 'shortcuts' ? shortcutsToggle : controlsToggle).focus();
    }
  }
  function toggleSection(id) {
    if (id === 'settings') { setSidebarView(activeSidebar === 'controls' ? null : 'controls'); return; }
    if (id === 'shortcuts') { setSidebarView(activeSidebar === 'shortcuts' ? null : 'shortcuts'); return; }
    setSidebarView('controls');
    if (id === 'stems') {
      const button = document.getElementById('transcribe-stems-enabled');
      if (!button.disabled) button.focus();
    }
  }
  controlsToggle.addEventListener('click', () => toggleSection('settings'));
  shortcutsToggle.addEventListener('click', () => toggleSection('shortcuts'));
  closeSidebar.addEventListener('click', () => setSidebarView(null));
  document.addEventListener('pointerdown', event => {
    if (mobileWorkspace.matches && sidebarOpen && !sidebar.contains(event.target) && !controlsToggle.contains(event.target) && !shortcutsToggle.contains(event.target)) setSidebarView(null);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebarOpen && !document.querySelector(':popover-open')) {
      event.preventDefault();
      const trigger = activeSidebar === 'shortcuts' ? shortcutsToggle : controlsToggle;
      setSidebarView(null);
      trigger.focus();
    }
  });
  function adaptWorkspace() {
    updateSections();
    state.spectrumCursor = null;
    requestAnimationFrame(() => {
      const maximumScroll = Math.max(0, elements.analysisGrid.scrollWidth - elements.analysisGrid.clientWidth);
      const whiteKeyWidth = elements.keyboard.getBoundingClientRect().width / spectrumWhiteKeyCount;
      elements.analysisGrid.scrollLeft = mobileWorkspace.matches ? clamp(whiteKeysBefore(53) * whiteKeyWidth, 0, maximumScroll) : 0;
      state.spectrumScrollProgress = maximumScroll ? elements.analysisGrid.scrollLeft / maximumScroll : 0;
      resizeCanvases();
    });
  }
  mobileWorkspace.addEventListener('change', adaptWorkspace);
  adaptWorkspace();

  const refreshTheme = () => { updateThemeColors(); renderAll(); };
  new MutationObserver(refreshTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refreshTheme);

  const resizeObserver = new ResizeObserver(() => resizeCanvases());
  [elements.overview, elements.waveform, elements.analysisGrid].forEach((element) => resizeObserver.observe(element));
  const transportElement = app.querySelector('.transcribe-transport');
  const transportResizeObserver = new ResizeObserver(() => {
    const height = `${transportElement.getBoundingClientRect().height}px`;
    if (app.style.getPropertyValue('--tr-footer-height') !== height) {
      app.style.setProperty('--tr-footer-height', height);
    }
  });
  transportResizeObserver.observe(transportElement);

  app.dataset.viewMode = 'timeline';
  requestAnimationFrame(() => {
    resizeCanvases();
  });
  updateLoopControls();
  updateTimecode();
  stems = new TranscribeStems.Panel({
    buffer: () => state.audioBuffer,
    selection: () => hasSelection() && !state.dragging ? { start: state.loopStart, end: state.loopEnd } : null,
    apply: (blob, range, samples) => {
      transport.switchSource(blob, range);
      updatePitchPreservation();
      worker.postMessage({ type: 'stem-overlay', samples, start: range?.start, end: range?.end, sampleRate: 44100 }, samples ? [samples.buffer] : []);
      state.lastSpectrumTime = null;
      state.spectrumRequestInvalidated = state.analysisInFlight;
      updateLoopControls(); updateTimecode(); renderAll();
      requestSpectrumAt(transport.currentTime, true);
    },
    changed: () => saveSession()
  });

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
