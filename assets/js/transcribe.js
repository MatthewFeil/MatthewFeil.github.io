(() => {
  const app = document.querySelector('[data-transcribe-app]');

  if (!app) {
    return;
  }

  const PREVIEW_PASSWORD_HASH = 'f3fa372413103704099be8e3761c02c2380213ba4629989156b022e183a93786';
  const PREVIEW_SESSION_KEY = 'transcribe-preview-unlocked';
  const scriptUrl = document.currentScript?.src || `${window.location.origin}/assets/js/transcribe.js`;

  const elements = {
    gate: document.getElementById('transcribe-gate'),
    gateForm: document.getElementById('transcribe-gate-form'),
    gatePassword: document.getElementById('transcribe-password'),
    gateStatus: document.getElementById('transcribe-gate-status'),
    workspace: document.getElementById('transcribe-workspace'),
    file: document.getElementById('transcribe-file'),
    fileName: document.getElementById('transcribe-file-name'),
    localStatus: document.getElementById('transcribe-local-status'),
    audio: document.getElementById('transcribe-audio'),
    speed: document.getElementById('transcribe-speed'),
    pitchLock: document.getElementById('transcribe-pitch-lock'),
    loopTop: document.getElementById('transcribe-loop-top'),
    loopBottom: document.getElementById('transcribe-loop-bottom'),
    channel: document.getElementById('transcribe-channel'),
    highpass: document.getElementById('transcribe-highpass'),
    lowpass: document.getElementById('transcribe-lowpass'),
    spectrumToggle: document.getElementById('transcribe-spectrum-toggle'),
    markMeasure: document.getElementById('transcribe-mark-measure'),
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
    rewind: document.getElementById('transcribe-rewind'),
    previous: document.getElementById('transcribe-previous'),
    play: document.getElementById('transcribe-play'),
    next: document.getElementById('transcribe-next'),
    forward: document.getElementById('transcribe-forward'),
    timecode: document.getElementById('transcribe-timecode'),
    volume: document.getElementById('transcribe-volume'),
    zoomOut: document.getElementById('transcribe-zoom-out'),
    zoomIn: document.getElementById('transcribe-zoom-in'),
    zoomValue: document.getElementById('transcribe-zoom-value'),
    viewButtons: [...document.querySelectorAll('[data-view-mode]')]
  };

  const state = {
    fileUrl: null,
    audioBuffer: null,
    duration: 0,
    peaks: null,
    zoom: 1,
    viewStart: 0,
    loopStart: null,
    loopEnd: null,
    loopEnabled: false,
    markers: [],
    dragging: null,
    dragOriginX: 0,
    analysisId: 0,
    spectrogram: null,
    spectrumCursor: null,
    animationFrame: null,
    audioContext: null,
    mediaSource: null,
    highpassNode: null,
    lowpassNode: null,
    midNode: null,
    splitterNode: null,
    leftGain: null,
    rightGain: null,
    mergerNode: null,
    outputGain: null
  };

  const worker = new Worker(new URL('transcribe-analysis-worker.js', scriptUrl));
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

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function hashText(value) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((buffer) => (
      [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    ));
  }

  function unlockWorkspace() {
    elements.gate.hidden = true;
    elements.workspace.hidden = false;
    app.dataset.viewMode = 'timeline';
    requestAnimationFrame(() => resizeCanvases());
  }

  function initializeGate() {
    let unlocked = app.dataset.gateEnabled !== 'true';

    try {
      unlocked ||= sessionStorage.getItem(PREVIEW_SESSION_KEY) === 'true';
    } catch {
      // The password still works when session storage is unavailable.
    }

    if (unlocked) {
      unlockWorkspace();
      return;
    }

    elements.gateForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      elements.gateStatus.textContent = 'Checking…';
      const candidateHash = await hashText(elements.gatePassword.value);

      if (candidateHash !== PREVIEW_PASSWORD_HASH) {
        elements.gateStatus.textContent = 'That password is not correct.';
        elements.gatePassword.select();
        return;
      }

      try {
        sessionStorage.setItem(PREVIEW_SESSION_KEY, 'true');
      } catch {
        // Continue with a tab-only in-memory unlock.
      }

      elements.gateStatus.textContent = '';
      unlockWorkspace();
    });
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
    elements.timecode.textContent = `${formatTime(elements.audio.currentTime)} / ${formatTime(state.duration)}`;
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

    if (state.markers.length >= 2) {
      const measureLength = state.markers[1] - state.markers[0];
      const beatLength = measureLength / 4;
      const firstBeat = Math.max(0, Math.floor((state.viewStart - state.markers[0]) / beatLength));
      const lastBeat = Math.ceil((state.viewStart + visibleDuration - state.markers[0]) / beatLength);

      context.font = '700 11.5px "Familjen Grotesk", Arial, sans-serif';
      for (let beatIndex = firstBeat; beatIndex <= lastBeat; beatIndex += 1) {
        const time = state.markers[0] + beatIndex * beatLength;
        if (time < 0 || time > state.duration) {
          continue;
        }

        const beat = ((beatIndex % 4) + 4) % 4;
        const x = timeToX(time, width);
        const isMeasure = beat === 0;
        context.strokeStyle = isMeasure ? colors.borderStrong : colors.border;
        context.lineWidth = isMeasure ? 1 : 0.75;
        context.setLineDash(isMeasure ? [] : [3, 5]);
        context.beginPath();
        context.moveTo(x + 0.5, 24);
        context.lineTo(x + 0.5, height);
        context.stroke();
        context.setLineDash([]);

        if (beatIndex >= 0) {
          context.fillStyle = isMeasure ? colors.text : colors.muted;
          context.fillText(isMeasure ? `M${Math.floor(beatIndex / 4) + 1}` : String(beat + 1), x + 5, isMeasure ? 27 : 31);
        }
      }
    }

    if (state.markers.length < 2) {
      state.markers.forEach((time, index) => {
        if (time < state.viewStart || time > state.viewStart + visibleDuration) {
          return;
        }

        const x = timeToX(time, width);
        context.strokeStyle = colors.borderStrong;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x + 0.5, 24);
        context.lineTo(x + 0.5, height);
        context.stroke();
        context.fillStyle = colors.text;
        context.font = '700 15px "Familjen Grotesk", Arial, sans-serif';
        context.fillText(String(index + 1), x + 6, 27);
      });
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
      context.fillStyle = colors.text;
      context.font = '800 11.5px "Familjen Grotesk", Arial, sans-serif';
      context.fillText('A', startX - 3, 34);
      context.fillText('B', endX - 3, 34);
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
    const minimumMidi = 36;
    const maximumMidi = 108;
    const rows = maximumMidi - minimumMidi;
    const rowHeight = height / rows;
    const blackPitchClasses = new Set([1, 3, 6, 8, 10]);

    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    for (let row = 0; row < rows; row += 1) {
      const midi = minimumMidi + row;
      const y = height - (row + 1) * rowHeight;
      const pitchClass = midi % 12;
      const isBlack = blackPitchClasses.has(pitchClass);
      const keyWidth = isBlack ? width * 0.58 : width * 0.86;

      context.fillStyle = isBlack ? '#090909' : colors.text;
      context.fillRect(0, y, keyWidth, Math.max(1, rowHeight));
      context.strokeStyle = isBlack ? colors.borderStrong : '#171717';
      context.strokeRect(0.5, y + 0.5, keyWidth - 1, Math.max(1, rowHeight - 1));

      if (pitchClass === 0 && rowHeight >= 2.4) {
        context.fillStyle = colors.text;
        context.font = '700 11.5px "Familjen Grotesk", Arial, sans-serif';
        context.textBaseline = 'middle';
        context.fillText(`C${Math.floor(midi / 12) - 1}`, width * 0.88, y + rowHeight / 2);
      }
    }

    if (cursorMidi !== null) {
      const y = height - ((cursorMidi - minimumMidi) / rows) * height;
      context.strokeStyle = colors.accent;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
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
    elements.frequencyReadout.textContent = `${formatTime(time)} · selected spectrum point`;
  }

  function setDominantPitchCursor(fraction = 0.5) {
    if (!state.spectrogram) {
      resetPitchReadout();
      return;
    }

    const { data, frames, rows, minimumMidi, start, end } = state.spectrogram;
    const frame = clamp(Math.round(fraction * (frames - 1)), 0, frames - 1);
    let strongestRow = 0;
    let strongestValue = -1;
    for (let row = 0; row < rows; row += 1) {
      const value = data[frame * rows + row];
      if (value > strongestValue) {
        strongestValue = value;
        strongestRow = row;
      }
    }
    updatePitchReadout(start + (frame / Math.max(1, frames - 1)) * (end - start), minimumMidi + strongestRow);
  }

  function drawSpectrogram() {
    const { context, width, height } = configureCanvas(elements.spectrogram);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    if (!state.spectrogram || elements.spectrumToggle.getAttribute('aria-pressed') !== 'true') {
      context.fillStyle = colors.muted;
      context.font = '700 12px "Familjen Grotesk", Arial, sans-serif';
      context.textBaseline = 'middle';
      context.fillText(state.loopStart === null ? 'Select a passage to inspect its frequency content' : 'Spectrum view is off', 16, height / 2);
      drawKeyboard();
      return;
    }

    const { data, frames, rows, minimumMidi } = state.spectrogram;
    const cellWidth = width / frames;
    const cellHeight = height / rows;

    for (let frame = 0; frame < frames; frame += 1) {
      for (let row = 0; row < rows; row += 1) {
        const value = data[frame * rows + row] / 255;
        const brightness = Math.round(8 + value * 238);
        context.fillStyle = `rgb(${brightness} ${brightness} ${brightness})`;
        context.fillRect(frame * cellWidth, height - (row + 1) * cellHeight, Math.ceil(cellWidth + 0.5), Math.ceil(cellHeight + 0.5));
      }
    }

    context.strokeStyle = colors.border;
    context.lineWidth = 1;
    for (let midi = 36; midi <= 108; midi += 12) {
      const y = height - ((midi - minimumMidi) / rows) * height;
      context.beginPath();
      context.moveTo(0, y + 0.5);
      context.lineTo(width, y + 0.5);
      context.stroke();
    }

    if (state.spectrumCursor) {
      const cursorX = ((state.spectrumCursor.time - state.spectrogram.start) / Math.max(0.001, state.spectrogram.end - state.spectrogram.start)) * width;
      const cursorY = height - ((state.spectrumCursor.midi - minimumMidi) / rows) * height;
      context.strokeStyle = colors.accent;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cursorX, 0);
      context.lineTo(cursorX, height);
      context.moveTo(0, cursorY);
      context.lineTo(width, cursorY);
      context.stroke();
      drawKeyboard(state.spectrumCursor.midi);
    } else {
      drawKeyboard();
    }
  }

  function renderAll() {
    drawOverview();
    drawWaveform();
    drawSpectrogram();
    updateTimecode();
  }

  function resizeCanvases() {
    renderAll();
  }

  function setControlsEnabled(enabled) {
    [
      elements.rewind,
      elements.previous,
      elements.play,
      elements.next,
      elements.forward,
      elements.volume,
      elements.zoomOut,
      elements.zoomIn,
      elements.markMeasure
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
    state.splitterNode = state.audioContext.createChannelSplitter(2);
    state.leftGain = state.audioContext.createGain();
    state.rightGain = state.audioContext.createGain();
    state.mergerNode = state.audioContext.createChannelMerger(2);
    state.outputGain = state.audioContext.createGain();

    state.mediaSource.connect(state.highpassNode);
    state.highpassNode.connect(state.lowpassNode);
    state.lowpassNode.connect(state.midNode);
    state.midNode.connect(state.splitterNode);
    state.splitterNode.connect(state.leftGain, 0);
    state.splitterNode.connect(state.rightGain, 1);
    state.mergerNode.connect(state.outputGain);
    state.outputGain.connect(state.audioContext.destination);
    updateFilters();
    updateVolume();
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
    [elements.loopTop, elements.loopBottom].forEach((button) => {
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

  function jumpMarker(direction) {
    if (!state.markers.length) {
      seekBy(direction * 5);
      return;
    }

    const current = elements.audio.currentTime;
    const candidates = direction < 0
      ? state.markers.filter((time) => time < current - 0.05).reverse()
      : state.markers.filter((time) => time > current + 0.05);
    elements.audio.currentTime = candidates[0] ?? (direction < 0 ? 0 : state.duration);
    normalizeViewStart();
    renderAll();
  }

  function markMeasure() {
    if (!state.duration) {
      return;
    }

    const time = elements.audio.currentTime;
    const existing = state.markers.findIndex((marker) => Math.abs(marker - time) < 0.12);
    if (existing >= 0) {
      state.markers.splice(existing, 1);
    } else {
      state.markers.push(time);
      state.markers.sort((a, b) => a - b);
    }
    drawWaveform();
  }

  function setZoom(nextZoom) {
    if (!state.duration) {
      return;
    }
    state.zoom = clamp(nextZoom, 1, 16);
    normalizeViewStart();
    elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
    drawOverview();
    drawWaveform();
  }

  function analyzeSelection() {
    if (state.loopStart === null || state.loopEnd === null || state.loopEnd - state.loopStart < 0.04) {
      state.spectrogram = null;
      state.spectrumCursor = null;
      resetPitchReadout();
      elements.frequencyReadout.textContent = 'Select a passage to inspect its frequency content';
      drawSpectrogram();
      return;
    }

    state.analysisId += 1;
    state.spectrogram = null;
    state.spectrumCursor = null;
    resetPitchReadout();
    elements.analysisProgress.hidden = false;
    elements.frequencyReadout.textContent = `${formatTime(state.loopStart)}–${formatTime(state.loopEnd)} · analyzing`;
    const width = Math.max(160, elements.spectrogram.getBoundingClientRect().width);
    worker.postMessage({
      type: 'analyze',
      id: state.analysisId,
      start: state.loopStart,
      end: state.loopEnd,
      frames: Math.round(clamp(width / 4, 80, 260))
    });
    drawSpectrogram();
  }

  function setSelection(start, end, shouldAnalyze = true) {
    state.loopStart = clamp(Math.min(start, end), 0, state.duration);
    state.loopEnd = clamp(Math.max(start, end), 0, state.duration);
    const duration = state.loopEnd - state.loopStart;

    if (duration < 0.04) {
      state.loopStart = null;
      state.loopEnd = null;
      state.loopEnabled = false;
      elements.selectionStatus.textContent = 'Drag across the waveform to create a loop.';
    } else {
      elements.selectionStatus.textContent = `A ${formatTime(state.loopStart)} · B ${formatTime(state.loopEnd)} · ${duration.toFixed(3)} seconds`;
    }

    updateLoopControls();
    renderAll();
    if (shouldAnalyze) {
      analyzeSelection();
    }
  }

  async function loadFile(file) {
    if (!file) {
      return;
    }

    if (state.fileUrl) {
      URL.revokeObjectURL(state.fileUrl);
    }

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
      state.audioBuffer = await state.audioContext.decodeAudioData(buffer.slice(0));
      state.duration = state.audioBuffer.duration;
      state.zoom = 1;
      state.viewStart = 0;
      state.loopStart = null;
      state.loopEnd = null;
      state.loopEnabled = false;
      state.markers = [];
      state.spectrogram = null;
      state.spectrumCursor = null;
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
        bucketCount: 8000
      }, [samples.buffer]);

      elements.localStatus.textContent = 'Local';
      elements.audioFormat.textContent = `${(state.audioBuffer.sampleRate / 1000).toFixed(1)} kHz · ${state.audioBuffer.numberOfChannels === 1 ? 'Mono' : `${state.audioBuffer.numberOfChannels} channels`} · local`;
      elements.selectionStatus.textContent = 'Drag across the waveform to create a loop.';
      elements.zoomValue.textContent = '100%';
      elements.speed.value = '0.75';
      elements.audio.playbackRate = 0.75;
      elements.audio.preservesPitch = true;
      setControlsEnabled(true);
      updateLoopControls();
      updateTimecode();
      renderAll();
    } catch (error) {
      console.error(error);
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
    if (!state.duration) {
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
      state.dragging = 'new';
      state.loopStart = time;
      state.loopEnd = time;
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
    state.dragging = null;

    if (moved < 4) {
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

  function handleOverviewPointer(event) {
    if (!state.duration) {
      return;
    }
    const rect = elements.overview.getBoundingClientRect();
    const time = clamp((event.offsetX / rect.width) * state.duration, 0, state.duration);
    elements.audio.currentTime = time;
    normalizeViewStart(time);
    renderAll();
  }

  function handleSpectrogramPointer(event) {
    if (!state.spectrogram) {
      return;
    }

    const rect = elements.spectrogram.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width);
    const y = clamp(event.clientY - rect.top, 0, rect.height);
    const fractionFromBottom = 1 - y / rect.height;
    const continuousMidi = state.spectrogram.minimumMidi + fractionFromBottom * state.spectrogram.rows;
    const time = state.spectrogram.start + (x / rect.width) * (state.spectrogram.end - state.spectrogram.start);
    updatePitchReadout(time, continuousMidi);
    drawSpectrogram();
  }

  function handleSpectrogramKeydown(event) {
    if (!state.spectrogram || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    if (!state.spectrumCursor) {
      setDominantPitchCursor(0.5);
    }

    const timeStep = (state.spectrogram.end - state.spectrogram.start) / Math.max(1, state.spectrogram.frames - 1);
    const time = clamp(
      state.spectrumCursor.time + (event.key === 'ArrowLeft' ? -timeStep : event.key === 'ArrowRight' ? timeStep : 0),
      state.spectrogram.start,
      state.spectrogram.end
    );
    const midi = clamp(
      state.spectrumCursor.midi + (event.key === 'ArrowDown' ? -0.1 : event.key === 'ArrowUp' ? 0.1 : 0),
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
      drawOverview();
    }

    drawWaveform();
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
      state.spectrogram = {
        data: new Uint8Array(message.data),
        frames: message.frames,
        rows: message.rows,
        minimumMidi: message.minimumMidi,
        maximumMidi: message.maximumMidi,
        start: message.start,
        end: message.end
      };
      elements.analysisProgress.hidden = true;
      elements.frequencyReadout.textContent = `${formatTime(message.start)}–${formatTime(message.end)} · inspect with pointer, touch, or arrow keys`;
      setDominantPitchCursor(0.5);
      drawSpectrogram();
    }
  });

  elements.file.addEventListener('change', () => loadFile(elements.file.files?.[0]));
  elements.speed.addEventListener('change', () => {
    elements.audio.playbackRate = Number(elements.speed.value);
  });
  elements.pitchLock.addEventListener('click', () => {
    const enabled = elements.pitchLock.getAttribute('aria-pressed') !== 'true';
    elements.pitchLock.setAttribute('aria-pressed', String(enabled));
    elements.pitchLock.classList.toggle('is-active', enabled);
    elements.pitchLock.querySelector('strong').textContent = enabled ? 'On' : 'Off';
    elements.audio.preservesPitch = enabled;
  });
  elements.loopTop.addEventListener('click', toggleLoop);
  elements.loopBottom.addEventListener('click', toggleLoop);
  elements.channel.addEventListener('change', reconnectChannels);
  elements.highpass.addEventListener('change', updateFilters);
  elements.lowpass.addEventListener('change', updateFilters);
  elements.spectrumToggle.addEventListener('click', () => {
    const enabled = elements.spectrumToggle.getAttribute('aria-pressed') !== 'true';
    elements.spectrumToggle.setAttribute('aria-pressed', String(enabled));
    elements.spectrumToggle.classList.toggle('is-active', enabled);
    elements.spectrumToggle.querySelector('strong').textContent = enabled ? 'On' : 'Off';
    drawSpectrogram();
  });
  elements.markMeasure.addEventListener('click', markMeasure);
  elements.rewind.addEventListener('click', () => seekBy(-5));
  elements.previous.addEventListener('click', () => jumpMarker(-1));
  elements.play.addEventListener('click', togglePlayback);
  elements.next.addEventListener('click', () => jumpMarker(1));
  elements.forward.addEventListener('click', () => seekBy(5));
  elements.volume.addEventListener('input', updateVolume);
  elements.zoomOut.addEventListener('click', () => setZoom(state.zoom / 2));
  elements.zoomIn.addEventListener('click', () => setZoom(state.zoom * 2));

  elements.overview.addEventListener('pointerdown', handleOverviewPointer);
  elements.waveform.addEventListener('pointerdown', handleWaveformPointerDown);
  elements.waveform.addEventListener('pointermove', handleWaveformPointerMove);
  elements.waveform.addEventListener('pointerup', handleWaveformPointerUp);
  elements.waveform.addEventListener('pointercancel', handleWaveformPointerUp);
  elements.spectrogram.addEventListener('pointerdown', handleSpectrogramPointer);
  elements.spectrogram.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.buttons === 1) {
      handleSpectrogramPointer(event);
    }
  });
  elements.spectrogram.addEventListener('keydown', handleSpectrogramKeydown);

  elements.audio.addEventListener('play', () => {
    elements.play.classList.add('is-playing');
    elements.play.setAttribute('aria-label', 'Pause');
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = requestAnimationFrame(updatePlaybackFrame);
  });
  elements.audio.addEventListener('pause', () => {
    elements.play.classList.remove('is-playing');
    elements.play.setAttribute('aria-label', 'Play');
    cancelAnimationFrame(state.animationFrame);
    renderAll();
  });
  elements.audio.addEventListener('ended', () => {
    elements.play.classList.remove('is-playing');
    elements.play.setAttribute('aria-label', 'Play');
    updateTimecode();
  });
  elements.audio.addEventListener('seeked', renderAll);

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
    if (elements.workspace.hidden || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seekBy(event.shiftKey ? -5 : -2);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seekBy(event.shiftKey ? 5 : 2);
    } else if (event.key.toLowerCase() === 'l') {
      toggleLoop();
    } else if (event.key.toLowerCase() === 'm') {
      markMeasure();
    } else if (event.key === '[' && state.duration) {
      setSelection(elements.audio.currentTime, state.loopEnd ?? clamp(elements.audio.currentTime + 2, 0, state.duration));
    } else if (event.key === ']' && state.duration) {
      setSelection(state.loopStart ?? clamp(elements.audio.currentTime - 2, 0, state.duration), elements.audio.currentTime);
    }
  });

  const resizeObserver = new ResizeObserver(() => resizeCanvases());
  [elements.overview, elements.waveform, elements.analysisGrid].forEach((element) => resizeObserver.observe(element));

  initializeGate();
  updateLoopControls();
  updateTimecode();
})();
