class TranscribePitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{
      name: 'pitchFactor',
      defaultValue: 1,
      minValue: 0.45,
      maxValue: 2.2,
      automationRate: 'k-rate'
    }];
  }

  constructor() {
    super();
    this.windowSeconds = 0.075;
    this.writeIndex = 0;
    this.phase = 0;
    this.buffers = [];
  }

  ensureBuffers(channelCount) {
    const length = Math.ceil(sampleRate * 0.12);
    while (this.buffers.length < channelCount) this.buffers.push(new Float32Array(length));
  }

  read(buffer, delaySamples) {
    let position = this.writeIndex - delaySamples;
    while (position < 0) position += buffer.length;
    const lower = Math.floor(position) % buffer.length;
    const upper = (lower + 1) % buffer.length;
    const fraction = position - Math.floor(position);
    return buffer[lower] * (1 - fraction) + buffer[upper] * fraction;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;
    this.ensureBuffers(output.length);
    const factor = parameters.pitchFactor[0] || 1;
    const windowSamples = this.windowSeconds * sampleRate;
    const phaseStep = Math.abs(factor - 1) / Math.max(1, windowSamples);

    for (let frame = 0; frame < output[0].length; frame += 1) {
      if (Math.abs(factor - 1) < 0.00001) {
        for (let channel = 0; channel < output.length; channel += 1) {
          output[channel][frame] = input[Math.min(channel, input.length - 1)]?.[frame] || 0;
        }
        continue;
      }
      const phaseA = this.phase;
      const phaseB = (this.phase + 0.5) % 1;
      const delayA = (factor > 1 ? 1 - phaseA : phaseA) * windowSamples;
      const delayB = (factor > 1 ? 1 - phaseB : phaseB) * windowSamples;
      const gainA = Math.sin(Math.PI * phaseA) ** 2;
      const gainB = Math.sin(Math.PI * phaseB) ** 2;
      for (let channel = 0; channel < output.length; channel += 1) {
        const source = input[Math.min(channel, input.length - 1)];
        const buffer = this.buffers[channel];
        buffer[this.writeIndex] = source?.[frame] || 0;
        output[channel][frame] = this.read(buffer, delayA) * gainA + this.read(buffer, delayB) * gainB;
      }
      this.writeIndex = (this.writeIndex + 1) % this.buffers[0].length;
      this.phase = (this.phase + phaseStep) % 1;
    }
    return true;
  }
}

registerProcessor('transcribe-pitch-processor', TranscribePitchProcessor);
