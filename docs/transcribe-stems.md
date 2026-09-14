# Stem separation

Transcribe separates a highlighted passage (40 ms–60 s) into drums, bass, other, vocals, guitar, and piano. All inference happens locally in a
terminable Web Worker. No recording, samples, or config are sent to a service.

## Assets and licenses

- ONNX Runtime Web **1.29.0**, MIT, is vendored in
  `assets/vendor/onnxruntime/`. Files come from the pinned npm distribution
  at `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/`.
  Its license is alongside the runtime. The WASM binary is approximately 14 MB.
- Model: StemSplit's HTDemucs six-stem ONNX conversion, fixed at 343980 stereo
  samples at 44100 Hz. Source order: drums, bass, other, vocals, guitar, piano.
  The model card declares MIT. Demucs and conversion license notices follow.
- Download URL (static weights, not an inference API):
  `https://huggingface.co/StemSplitio/htdemucs-6s-onnx/resolve/49df9b6989cf2150840ea65b0bef77a2e471b678/htdemucs_6s_fp16weights.onnx`
- Model SHA-256:
  `7ce55792e2231c93fbf92de95f5fd5b3a5e6c89f7db690dfd693e8f1dce56869`

The 136 MB model downloads only on Separate highlight and is cached in Cache
Storage when available. The worker verifies the digest before loading it.
Downloading needs a connection on first use; inference does not. Cached data can
be evicted by the browser. No API key, Python installation, GPU, special response
headers, or application backend is required. Serve the static site over HTTPS
(or localhost). The model can be self-hosted by updating its URL, retaining the
same digest. Model weights are not committed to the site repository.

## Processing and playback

The highlight is cropped before resampling, so no samples outside it enter the
model. Short highlights are centered in a zero-padded model input. Longer ones
use 25% overlap-add with nonzero edge weights. The worker returns exactly the
highlight's sample length. Cancellation, file replacement, and selection changes
terminate the job and reject late results.

The CPU WASM backend runs with one thread for compatibility with static hosting.
Graph optimization, CPU memory arena, and memory patterns are disabled: default
optimization failed to initialize this particular model with `std::bad_alloc`
in Chrome. This is a measured compatibility choice, not a GPU implementation.
The 60-second output cap bounds stem storage; model working memory is still
substantial, even for short highlights. Desktop Chrome has been exercised;
mobile rendering checks do not establish mobile inference performance.

The enabled stems are summed into a temporary PCM WAV for the existing media
element. This retains native playback-rate/pitch-lock behavior and the existing
filter, channel, pitch-worklet, and volume graph. A transport adapter maps segment
seconds back to original-track seconds for markers, seeking, looping, and the
playhead. Stem mode limits playback to its highlight. The original recording
returns when the master switch is off or the highlight changes. The waveform
remains the original recording; spectrum/chord analysis reads the selected mix.

Per-stem RMS below -80 dBFS or 40 dB below the input RMS receives “Very little
audio detected.” This is a quiet-output heuristic, not a claim that an instrument
is absent. Stereo energy is measured before downmixing to avoid phase
cancellation falsely labeling a stem quiet. Quiet stems remain switchable.

Configs contain only six boolean stem preferences and a master preference.
Import restores choices without automatically downloading/running the model.
Highlight audio is kept in memory and is not exported or included in configs.

## Regression checks

Run `node tests/transcribe-stems.cjs` and the existing Transcribe config, markers,
spectrum, and chord scripts. Browser validation must exercise real model
inference separately from fixture-based mixing and UI tests. Synthetic audio
checks establish pipeline behavior, not separation quality on jazz recordings.

## Demucs license

MIT License

Copyright (c) Meta Platforms, Inc. and affiliates.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## ONNX conversion license

MIT License

Copyright (c) 2026 StemSplit

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
