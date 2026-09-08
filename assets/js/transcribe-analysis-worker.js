let audioSamples = null;
let audioSampleRate = 44100;
let activeAnalysisId = 0;

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

function buildSpectrogram(startSeconds, endSeconds, requestedFrames, analysisId) {
  if (!audioSamples) {
    return null;
  }

  const minimumMidi = 36;
  const maximumMidi = 108;
  const rows = maximumMidi - minimumMidi;
  const fftSize = 2048;
  const startSample = clamp(Math.floor(startSeconds * audioSampleRate), 0, audioSamples.length - 1);
  const endSample = clamp(Math.ceil(endSeconds * audioSampleRate), startSample + 1, audioSamples.length);
  const available = endSample - startSample;
  const frames = clamp(requestedFrames, 48, 280);
  const hop = Math.max(1, Math.floor(Math.max(1, available - fftSize) / Math.max(1, frames - 1)));
  const magnitudes = new Float32Array(frames * rows);
  let peakDb = -120;

  for (let frame = 0; frame < frames; frame += 1) {
    if (analysisId !== activeAnalysisId) {
      return null;
    }

    const real = new Float32Array(fftSize);
    const imaginary = new Float32Array(fftSize);
    const frameStart = Math.min(startSample + frame * hop, Math.max(startSample, endSample - fftSize));

    for (let index = 0; index < fftSize; index += 1) {
      const sourceIndex = frameStart + index;
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
      real[index] = (audioSamples[sourceIndex] || 0) * window;
    }

    fft(real, imaginary);

    for (let row = 0; row < rows; row += 1) {
      const midi = minimumMidi + row;
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const bin = clamp(Math.round((frequency * fftSize) / audioSampleRate), 1, fftSize / 2 - 1);
      const magnitude = Math.hypot(real[bin], imaginary[bin]) / fftSize;
      const db = 20 * Math.log10(magnitude + 1e-8);
      magnitudes[frame * rows + row] = db;
      peakDb = Math.max(peakDb, db);
    }
  }

  const floorDb = peakDb - 62;
  const pixels = new Uint8Array(magnitudes.length);

  for (let index = 0; index < magnitudes.length; index += 1) {
    const normalized = clamp((magnitudes[index] - floorDb) / Math.max(1, peakDb - floorDb), 0, 1);
    pixels[index] = Math.round(255 * normalized ** 1.35);
  }

  return { data: pixels, frames, rows, minimumMidi, maximumMidi };
}

self.addEventListener('message', (event) => {
  const message = event.data || {};

  if (message.type === 'set-audio') {
    audioSamples = new Float32Array(message.samples);
    audioSampleRate = message.sampleRate;
    const peaks = buildPeaks(audioSamples, message.bucketCount || 6000);
    self.postMessage({ type: 'peaks', peaks }, [peaks.buffer]);
    return;
  }

  if (message.type === 'analyze') {
    activeAnalysisId = message.id;
    const result = buildSpectrogram(message.start, message.end, message.frames || 220, message.id);

    if (result && message.id === activeAnalysisId) {
      self.postMessage({
        type: 'spectrogram',
        id: message.id,
        start: message.start,
        end: message.end,
        ...result
      }, [result.data.buffer]);
    }
  }
});
