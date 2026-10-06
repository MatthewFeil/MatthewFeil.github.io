/* Shared, dependency-free audio operations for local Demucs separation. */
(() => {
  const names = ['drums', 'bass', 'other', 'vocals', 'guitar', 'piano'];
  const sampleRate = 44100;
  const maxSeconds = 60;
  function rms(channels) {
    let sum = 0, count = 0;
    for (const channel of channels) {
      for (const value of channel) {
        if (!Number.isFinite(value)) throw Error('The model returned invalid audio.');
        sum += value * value;
      }
      count += channel.length;
    }
    return Math.sqrt(sum / Math.max(1, count));
  }
  function activity(channels, inputRms) {
    const level = rms(channels);
    // Energy is only a quiet-output hint, not instrument classification.
    return { rms: level, quiet: level < 0.0001 || level < inputRms * 0.01 };
  }
  async function separate(channels, infer, progress, segment = 343980) {
    const length = channels[0].length;
    if (!length || channels.length !== 2 || channels[1].length !== length || length > maxSeconds * sampleRate) throw Error('Choose a highlight up to 60 seconds.');
    const overlap = Math.floor(segment / 4), stride = segment - overlap;
    const count = Math.max(1, Math.ceil((length - segment) / stride) + 1);
    const output = names.map(() => [new Float32Array(length), new Float32Array(length)]);
    const weights = new Float32Array(length);
    for (let part = 0; part < count; part++) {
      const start = part * stride, size = Math.min(segment, length - start);
      const input = new Float32Array(segment * 2);
      // Center short passages in the model's fixed input, without reading audio
      // outside the highlight. This avoids placing a short phrase at a boundary.
      const padding = count === 1 ? Math.floor((segment - size) / 2) : 0;
      for (let c = 0; c < 2; c++) input.set(channels[c].subarray(start, start + size), c * segment + padding);
      progress(part, count);
      const result = await infer(input);
      if (!(result instanceof Float32Array) || result.length !== names.length * 2 * segment) throw Error('The model did not return six stereo stems.');
      for (let i = 0; i < size; i++) {
        // Keep boundary weights nonzero. Never fade the outer edges to silence.
        const fadeIn = part > 0 ? Math.min(1, (i + 1) / overlap) : 1;
        const fadeOut = part < count - 1 ? Math.min(1, (segment - i) / overlap) : 1;
        const weight = Math.min(fadeIn, fadeOut);
        weights[start + i] += weight;
        for (let s = 0; s < names.length; s++) for (let c = 0; c < 2; c++) {
          const value = result[(s * 2 + c) * segment + padding + i];
          if (!Number.isFinite(value)) throw Error('The model returned invalid audio. Try a shorter highlight.');
          output[s][c][start + i] += value * weight;
        }
      }
    }
    for (const stem of output) for (const channel of stem) for (let i = 0; i < length; i++) channel[i] /= weights[i];
    return output;
  }
  function mix(stems, enabled) {
    const length = stems[0][0].length;
    const channels = [new Float32Array(length), new Float32Array(length)];
    for (let s = 0; s < names.length; s++) if (enabled[s]) for (let c = 0; c < 2; c++) {
      for (let i = 0; i < length; i++) channels[c][i] += stems[s][c][i];
    }
    return channels;
  }
  function wav(channels) {
    const length = channels[0].length;
    const bytes = new ArrayBuffer(44 + length * 4), view = new DataView(bytes);
    const word = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    word(0, 'RIFF'); view.setUint32(4, 36 + length * 4, true); word(8, 'WAVE'); word(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, length * 4, true);
    for (let i = 0; i < length; i++) for (let c = 0; c < 2; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(44 + (i * 2 + c) * 2, Math.round(v * (v < 0 ? 32768 : 32767)), true);
    }
    return bytes;
  }
  globalThis.TranscribeStemAudio = { names, sampleRate, maxSeconds, rms, activity, separate, mix, wav };
})();
