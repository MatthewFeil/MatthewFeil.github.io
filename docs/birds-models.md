# Bird Detection — local implementation and release gate

Status: camera interface and inference integration implemented; real bird identification
is **not enabled**. No weights, species names, or model accuracy claims are fabricated.
The page is noindex and unpublished. Its My Work card explicitly says validation is pending.

## Candidate review (2026-10-06)

- [houlette/birdclass-na](https://huggingface.co/houlette/birdclass-na): North American
  classifier; model weights explicitly CC-BY-NC-4.0. Excluded from commercial release.
- [k10z/birdvision-efficientnet-s](https://huggingface.co/k10z/birdvision-efficientnet-s):
  model card says weights derive from noncommercial iNaturalist data. Excluded.
- [rkutyna/bird-classifier](https://huggingface.co/rkutyna/bird-classifier): MIT label,
  but training includes NABirds, Birdsnap and iNaturalist without image-level commercial
  provenance. Not cleared merely because the model card says MIT.
- [BioCLIP](https://huggingface.co/imageomics/bioclip): model card advertises MIT;
  zero-shot encoder and mixed biodiversity training sources require a separate data
  provenance review and mobile export/performance evaluation. No weights obtained.
- [Birder](https://github.com/birder-project/birder): code generally Apache-2.0, but
  its documentation explicitly separates pretrained-weight/dataset permissions.
  No detector or classifier from this collection is approved by this implementation.

These are suitability findings, not legal conclusions about all possible uses.
No candidate was numerically evaluated: no approved weights or independently labeled
held-out footage are available here. PyTorch/ONNX are not installed in the current
Python environment. Do not report the 90% precision/70% coverage targets as achieved.

## Runtime contract

`assets/models/birds/manifest.json` is deliberately release-gated. To install an
approved pair, supply same-origin ONNX files, SHA-256 hashes and the following fields:

- Each model: `url`, `sha256`, `input`, `size: [width,height]`, `mean: [r,g,b]`,
  `std: [r,g,b]`. Input is float32 NCHW; RGB values are divided by 255 then normalized.
- Detector: `boxes`, `scores`, `labels` output names; `birdClass` integer;
  `threshold` validated on held-out data. Boxes are Nx4 normalized xyxy, scores Nx1,
  labels Nx1. Detection inputs are stretched to model size; wrappers must undo their
  own letterboxing and convert outputs into this normalized source-image contract.
- Classifier: `output` logits name, `threshold`, `margin` calibrated on held-out data.
  Output order matches `species: [{id, commonName, scientificName}]` exactly.
- Release: `approved`, `precision`, `coverage`, `latencyMs` (end-to-end stable
  suggestion), `realPhonesVerified`, `commercialUseReviewed`. Accuracy thresholds
  are .9 and .7, latency at most 3000ms. Approval is recorded only after evidence.

Worker verifies hashes, uses WebGPU when sessions load successfully, otherwise
single-thread WASM (no cross-origin isolation required). One active frame, no backlog;
2Hz sampling. Model failures retain the camera with an explicit identification-unavailable
message. Small crops are rejected. Three agreeing recent classifications stabilize a
name; overlays clear on absent/stale detections. Scores are not displayed as accuracy.

## Local evaluation tools

Create a dedicated Python virtual environment and install `script/birds/requirements.txt`
when approved weights and labeled evaluation data are available. `export.py` accepts
trusted local TorchScript wrappers; it does not select or download models. `evaluate.py`
consumes recorded real logits, ground truth, and measured inference latency. It never
approves a release itself. Keep unsupported species and non-bird examples in evaluation.
Split by bird/recording/location, not neighboring frames, and calibrate thresholds on a
separate validation split. Real camera-to-stable-label latency must be measured separately.

## Privacy and delivery

Only the page, scripts, fonts, model manifest, models and ONNX Runtime assets are fetched.
No third-party runtime URLs, inference services, image uploads, analytics or telemetry.
Bird page opts out of both analytics paths in shared layouts. Camera is requested only
on Start, with no microphone. Stop, pagehide and visibility loss release tracks and
terminate the worker. Manifest changes are revalidated; version model filenames for
browser HTTP caching. Offline use is not guaranteed; no site-wide service worker added.

Vendored ONNX Runtime Web 1.30.0 is MIT licensed with LICENSE and VERSION alongside it.
The 26MB runtime is fetched only after an approved manifest passes the gate, never by
other site pages. No preview server should be left running by tests.

## Required before publication

- Approved detector/classifier weights and auditable training-data provenance.
- Independent held-out accuracy, unsupported-species and lookalike tests.
- Real iPhone Safari and Android Chrome; permissions, rotation, interruption,
  sustained ten-minute heat/memory/performance and stable identification within 3s.
- Network inspection demonstrating no camera or result uploads.

No physical phones were available in this task. Desktop browser camera tests use a
synthetic browser camera **only as lifecycle test input**, never to assert bird detection.

## Checks completed in this implementation

Production Jekyll build and focused JavaScript/Python syntax checks passed. Core tests
cover portrait cropping, suppression, temporal stabilization and model release gating.
Chromium browser checks passed 320x568, 390x844, 844x390 and 1440x900: start/stop,
resume, interrupted tracks, denied permission, no horizontal overflow, touch control
geometry and same-origin GET-only requests. The production bird page has no analytics;
the existing homepage retains its prior analytics behavior. Independent Impeccable
review found no material camera-preview finish issues and no design-system change.

Constant numerical ONNX graphs exercised real locally bundled WASM inference, both
sessions, cropping, classification-score handling, temporal names and overlay rendering.
These are explicitly named test fixtures outside shipped model assets. They validate
software plumbing only, not bird detection or species accuracy. No physical-phone
benchmark, labeled bird evaluation, or model export was run.
