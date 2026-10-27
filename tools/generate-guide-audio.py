"""Rebuild guide drawings: python3 tools/generate-guide-audio.py (numpy + ffmpeg)."""
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np

folder = Path(__file__).resolve().parents[1] / 'assets/audio/transcribe-guide'
source = folder / 'example.mp3'
rate = 22050
pcm = np.frombuffer(subprocess.check_output([
    'ffmpeg', '-v', 'error', '-i', str(source), '-f', 'f32le',
    '-ar', str(rate), '-ac', '2', 'pipe:1'
]), dtype='<f4').reshape(-1, 2)
# Stereo peak envelopes at 200 buckets/second preserve short transients when panning.
hop = round(rate / 200)
envelope = np.pad(pcm, ((0, (-len(pcm)) % hop), (0, 0)))
envelope = np.max(np.abs(envelope.reshape(-1, hop, 2)), axis=1)
peaks = np.rint(np.clip(envelope, 0, 1) * 255).astype(int).T.tolist()
# Hann-windowed FFT, quarter-second snapshots, quarter-semitone pitch bins C1-C7.
size = 32768
frequencies = np.fft.rfftfreq(size, 1 / rate)
edges = 440 * 2 ** ((np.arange(289) / 4 + 24 - 0.125 - 69) / 12)
bins = np.clip(np.searchsorted(frequencies, edges), 1, len(frequencies) - 1)
window = np.hanning(size)
padded = np.pad(pcm, ((size // 2, size // 2), (0, 0)))
spectra = []
for time in np.arange(0, len(pcm) / rate, 0.25):
    start = round(time * rate)
    # Average channel powers so opposite-phase stereo content is retained.
    fft = np.fft.rfft(padded[start:start + size] * window[:, None], axis=0)
    power = np.sqrt(np.mean(np.abs(fft) ** 2, axis=1)) / (window.sum() / 2)
    spectra.append([float(np.max(power[left:max(left + 1, right)]))
                    for left, right in zip(bins[:-1], bins[1:])])
db = 20 * np.log10(np.maximum(spectra, 1e-8))
levels = np.rint(np.clip((db + 75) / 75, 0, 1) * 255).astype(int).tolist()
data = dict(duration=len(pcm) / rate, peakRate=rate / hop, peaks=peaks,
            spectrumStep=0.25, spectrumMidiStart=24, spectrumBinsPerNote=4,
            spectra=levels, sha256=hashlib.sha256(source.read_bytes()).hexdigest())
(folder / 'example-data.js').write_text(
    '// Generated from example.mp3 by tools/generate-guide-audio.py; do not edit.\n'
    'export default ' + json.dumps(data, separators=(',', ':')) + ';\n')
print(f'Generated {data["duration"]:.3f}s, {len(peaks[0])} stereo peaks, {len(levels)} spectra')
