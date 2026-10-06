importScripts('transcribe-notes.js?v=20261004-melody-dropouts');
let audioSamples = null;
let audioSampleRate = 44100;
let activeAnalysisId = 0;
let stemOverlay = null;
// Scratch buffers and Hann windows stay in the worker. Only result buffers transfer.
const fftWorkspaces = [32768, 8192].map(size => ({
  size, real: new Float32Array(size), imaginary: new Float32Array(size),
  window: Float64Array.from({ length: size }, (_, index) =>
    0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1))),
  mapping: null, mappingSampleRate: null, mappingPitchRatio: null
}));
function frequencyMapping(workspace, pitchRatio, rows, minimumMidi, binsPerSemitone) {
  if (workspace.mappingSampleRate === audioSampleRate && workspace.mappingPitchRatio === pitchRatio) return workspace.mapping;
  workspace.mapping = Array.from({ length: rows }, (_, row) => {
    const frequency = 440 * 2 ** ((minimumMidi + row / binsPerSemitone - 69) / 12) / pitchRatio;
    const bassWeight = clamp((400 - frequency) / 200, 0, 1);
    const weight = frequency >= audioSampleRate / 2 ? 0 : workspace.short ? 1 : workspace.size === 32768 ? bassWeight : 1 - bassWeight;
    const exactBin = clamp(frequency * workspace.size / audioSampleRate, 1, workspace.size / 2 - 2);
    return { weight, lowerBin: Math.floor(exactBin), fraction: exactBin - Math.floor(exactBin) };
  });
  workspace.mappingSampleRate = audioSampleRate;
  workspace.mappingPitchRatio = pitchRatio;
  return workspace.mapping;
}

const recentWorkspace = {
  size: 4096, short: true, real: new Float32Array(4096), imaginary: new Float32Array(4096),
  window: Float64Array.from({length:4096}, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / 4095)),
  mapping: null, mappingSampleRate: null, mappingPitchRatio: null
};
function recentSpectrum(center, pitchShiftCents, result) {
  const {size, real, imaginary, window} = recentWorkspace;
  const end = Math.floor(center * audioSampleRate);
  imaginary.fill(0);
  for (let i = 0; i < size; i++) real[i] = sampleAt(end - size + i) * window[i];
  fft(real, imaginary);
  const mapping = frequencyMapping(recentWorkspace, 2 ** (pitchShiftCents / 1200), result.rows, result.minimumMidi, result.binsPerSemitone);
  return Float32Array.from(mapping, ({weight, lowerBin, fraction}) => weight * (
    Math.hypot(real[lowerBin], imaginary[lowerBin]) * (1 - fraction)
    + Math.hypot(real[lowerBin + 1], imaginary[lowerBin + 1]) * fraction) / size);
}

function sampleAt(index) {
  if (!stemOverlay) return audioSamples[index] || 0;
  const time = index / audioSampleRate;
  // Stem mode plays only this range; FFT windows beyond its edges are silence.
  if (time < stemOverlay.start || time >= stemOverlay.end) return 0;
  const position = (time - stemOverlay.start) * stemOverlay.sampleRate;
  const first = Math.floor(position), fraction = position - first;
  const a = stemOverlay.samples[first] || 0, b = stemOverlay.samples[first + 1] || 0;
  return a + (b - a) * fraction;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function buildPeaks(samples, bucketCount) {
  const count = Math.max(1, Math.min(bucketCount, samples.length));
  const peaks = new Float32Array(count * 2);
  const samplesPerBucket = samples.length / count;

  for (let bucket = 0; bucket < count; bucket += 1) {
    const start = Math.floor(bucket * samplesPerBucket);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * samplesPerBucket));
    let minimum = 1;
    let maximum = -1;

    for (let index = start; index < end && index < samples.length; index += 1) {
      const sample = samples[index];
      minimum = Math.min(minimum, sample);
      maximum = Math.max(maximum, sample);
    }

    peaks[bucket * 2] = minimum;
    peaks[bucket * 2 + 1] = maximum;
  }

  return peaks;
}

function fft(real, imaginary) {
  const length = real.length;

  for (let index = 1, reversed = 0; index < length; index += 1) {
    let bit = length >> 1;

    for (; reversed & bit; bit >>= 1) {
      reversed ^= bit;
    }

    reversed ^= bit;

    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }

  for (let size = 2; size <= length; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);

    for (let offset = 0; offset < length; offset += size) {
      let phaseReal = 1;
      let phaseImaginary = 0;

      for (let half = 0; half < size / 2; half += 1) {
        const even = offset + half;
        const odd = even + size / 2;
        const oddReal = real[odd] * phaseReal - imaginary[odd] * phaseImaginary;
        const oddImaginary = real[odd] * phaseImaginary + imaginary[odd] * phaseReal;

        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;

        const nextPhaseReal = phaseReal * stepReal - phaseImaginary * stepImaginary;
        phaseImaginary = phaseReal * stepImaginary + phaseImaginary * stepReal;
        phaseReal = nextPhaseReal;
      }
    }
  }
}

function buildSpectrogram(startSeconds, endSeconds, requestedFrames, analysisId, pitchShiftCents = 0, aggregate = false) {
  if (!audioSamples) {
    return null;
  }

  const minimumMidi = 24;
  const maximumMidi = 96;
  const binsPerSemitone = 16;
  const rows = (maximumMidi - minimumMidi) * binsPerSemitone;
  const startSample = clamp(Math.floor(startSeconds * audioSampleRate), 0, audioSamples.length - 1);
  const endSample = clamp(Math.ceil(endSeconds * audioSampleRate), startSample + 1, audioSamples.length);
  const available = endSample - startSample;
  const frames = aggregate ? Math.max(1, Math.ceil(available / 4096)) : clamp(requestedFrames, 1, 280);
  const magnitudes = new Float32Array((aggregate ? 1 : frames) * rows);
  const frameMagnitudes = aggregate ? new Float32Array(rows) : null;
  const pitchRatio = 2 ** (pitchShiftCents / 1200);

  for (let frame = 0; frame < frames; frame += 1) {
    if (analysisId !== activeAnalysisId) {
      return null;
    }

    if (aggregate) frameMagnitudes.fill(0);

    // Longer bass windows resolve neighboring low notes; shorter treble
    // windows avoid unnecessarily mixing successive attacks. Both are centered.
    for (const workspace of fftWorkspaces) {
      const { size: fftSize, real, imaginary, window } = workspace;
      imaginary.fill(0);
      const mapping = frequencyMapping(workspace, pitchRatio, rows, minimumMidi, binsPerSemitone);
      const hop = Math.max(1, Math.floor(Math.max(1, available - fftSize) / Math.max(1, frames - 1)));
      const frameStart = aggregate
        ? Math.round(startSample + (frame + 0.5) * available / frames - fftSize / 2)
        : frames === 1
        ? Math.round((startSample + endSample - fftSize) / 2)
        : Math.min(startSample + frame * hop, Math.max(startSample, endSample - fftSize));

      for (let index = 0; index < fftSize; index += 1) {
        const sourceIndex = frameStart + index;
        real[index] = (aggregate && (sourceIndex < startSample || sourceIndex >= endSample) ? 0 : sampleAt(sourceIndex)) * window[index];
      }

      fft(real, imaginary);

      for (let row = 0; row < rows; row += 1) {
        const { weight, lowerBin, fraction } = mapping[row];
        if (!weight) continue;
        const lowerMagnitude = Math.hypot(real[lowerBin], imaginary[lowerBin]);
        const upperMagnitude = Math.hypot(real[lowerBin + 1], imaginary[lowerBin + 1]);
        const magnitude = (lowerMagnitude + (upperMagnitude - lowerMagnitude) * fraction) / fftSize;
        if (aggregate) frameMagnitudes[row] += magnitude * weight;
        else magnitudes[frame * rows + row] += magnitude * weight;
      }
    }
    if (aggregate) for (let row = 0; row < rows; row += 1) magnitudes[row] += frameMagnitudes[row] ** 2 / frames;
  }
  if (aggregate) for (let row = 0; row < rows; row += 1) magnitudes[row] = Math.sqrt(magnitudes[row]);

  return { data: magnitudes, frames: aggregate ? 1 : frames, rows, binsPerSemitone, minimumMidi, maximumMidi };
}

self.addEventListener('message', (event) => {
  const message = event.data || {};

  if (message.type === 'stem-overlay') {
    stemOverlay = message.samples ? message : null;
    return;
  }
  if (message.type === 'set-audio') {
    stemOverlay = null;
    audioSamples = new Float32Array(message.samples);
    audioSampleRate = message.sampleRate;
    const peaks = buildPeaks(audioSamples, message.bucketCount || 6000);
    self.postMessage({ type: 'peaks', peaks, generation: message.generation }, [peaks.buffer]);
    return;
  }

  if (message.type === 'analyze') {
    activeAnalysisId = message.id;
    const result = buildSpectrogram(message.start, message.end, message.frames || 220, message.id, message.pitchShiftCents, message.aggregate);

    if (result && message.id === activeAnalysisId) {
      const recent = message.detectionMode === 'melody' && !message.aggregate
        ? recentSpectrum(message.center, message.pitchShiftCents || 0, result) : null;
      const evidence = TranscribeNotes.extract(result.data, result.binsPerSemitone, result.minimumMidi, message.noteTolerance ?? .45, recent);
      self.postMessage({
        type: 'spectrogram',
        id: message.id,
        center: message.center,
        start: message.start,
        end: message.end,
        evidence,
        ...result
      }, [result.data.buffer]);
    }
  }
});
