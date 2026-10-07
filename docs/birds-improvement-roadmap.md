# Bird identifier: performance, accuracy, and extension roadmap

Assessment: 2026-10-07. This is an implementation proposal based on current source,
existing validation notes, and primary-source research. No runtime changes or new
model benchmarks were performed for this assessment.

## Recommendation

Build a reusable observation pipeline, then replace the classifier using an independent
evaluation set. Preserve the existing local processing, motion tracking, bounded
queues, and explicit uncertain results. These are useful foundations.

The largest accuracy opportunity is a model trained for the intended birds and camera
crops. The largest architectural opportunity is to separate detection, identification,
and observation state so expensive identification cannot dictate all camera analysis.

## Findings in the current implementation

| Finding | Consequence | Source |
|---|---|---|
| The classifier has 525 outputs but only 52 may be displayed. Blue Jay and several other common birds are absent. | Filtering reduces unsupported suggestions but cannot learn missing birds or materially reduce backbone computation. | `assets/models/birds/manifest.json` |
| Detection and classification execute sequentially; the UI waits for the final result before capturing its next AI frame. | Early geometry messages help, but a classifier call still delays subsequent detector work. | `assets/js/birds-worker.mjs:81`, `assets/js/birds.js:112` |
| The classifier's provider setting decides whether either model attempts WebGPU. Smaller specifies WASM. | Selecting Smaller forces the detector onto WASM too. Smaller download does not imply faster end-to-end behavior. | `assets/js/birds-worker.mjs:14` |
| Every inference uses canvas readback and JavaScript RGB/BGR-to-planar conversion. Motion also reads pixels on the main thread. | Pixel preparation and transfers are possible bottlenecks, independent of neural-network speed; profile before replacing. | `assets/js/birds-worker.mjs:47`, `assets/js/birds.js:90` |
| Capture requests 3840×2160 at 30fps on every device. | Useful source detail for distant birds, but potentially unnecessary bandwidth, memory and heat for nearby birds. | `assets/js/birds.js:155` |
| At 16:9 there are 40 search windows, with one discovery window at most every 800ms while tracking. | A complete rotating sweep takes about 32 seconds or longer. This is a scheduling bound, not a measured discovery latency; full-frame scans may find birds sooner. | `searchWindows`, worker discovery scheduling |
| Classification is reduced to one accepted species or null. Worker agreement counts and UI history implement separate stabilization rules. | Alternatives and evidence are lost, and the two notions of stable identity can diverge. | `scopedSpeciesSuggestion`, worker `agreements`, `BirdTracker.history` |
| Species IDs are model-index-based (`bird-23`), with null scientific names. | Replacing a model would make durable sightings and external species information difficult to join reliably. | Manifest species list |
| `evaluate.py` evaluates logits using threshold/margin but not the deployed regional filter, detection, or temporal stabilization. | Its summary is not an end-to-end measure of the current product. Existing reused-photo browser tests are regression fixtures, not an independent accuracy benchmark. | `script/birds/evaluate.py`, `tests/birds-*-browser.cjs` |

## 1. Establish a benchmark that guides model changes

Keep the existing regression fixtures. Add a separately held-out set with all intended
species, missing common species, lookalikes, females/juveniles, partial birds, multiple
birds, foliage, feeders, empty scenes, blur and difficult lighting. Split by original
photograph, individual, recording session and location where available; resized copies
and adjacent video frames must not cross training/calibration/test boundaries.

Use two evaluations: labeled bird crops isolate classifier quality; full camera clips
measure detection, tracking and naming together. Record per-species precision/recall,
accepted-name precision, correct-name coverage, unsupported-species false acceptance,
first-detection time, first stable correct-name time, identity switches and disappearance
latency. Include uncertainty intervals and sample counts; do not count every adjacent
frame as an independent successful identification.

Add local-only stage timings for capture, preprocessing, each detector pass, classifier,
message delivery and display age. Record actual camera resolution, provider per model,
cold/warm startup, downloaded bytes and p50/p95 latency. Run ten-minute sessions on a
real iPhone and Android phone, including three birds and difficult empty scenes. Track
memory where supported and sustained latency/battery behavior; browsers do not provide
a universal reliable temperature sensor.

The existing 90% accepted-name precision, 70% clear-species coverage and three-second
stable-name targets can remain initial goals, with explicit denominators and enough
examples. These are targets, not currently demonstrated performance.

## 2. Separate real-time work from identification

Proposed flow:

```text
Camera frame broker
  ├─ motion tracker ───────────────┐
  ├─ detector / discovery scheduler ─> central track store ─> live overlays
  └─ bounded best-crop sampler ─> classifier ─> evidence accumulator
                                                   └─> observation events
                                                        ├─ species details
                                                        ├─ local sightings
                                                        └─ optional audio/context
```

Give detector and classifier separate lifecycles and independently selected providers.
Start with bounded scheduling: one detector job in flight and one classification job,
with at most one replaceable pending crop per track. Use frame IDs, capture timestamps,
track generation and model version to reject late results after disappearance, identity
replacement, camera rotation or model switches. Motion remains independent.

Separate workers are a candidate implementation, not an automatic speedup. Simultaneous
GPU work can contend, and extra runtime instances cost memory. Benchmark independent
workers against a single inference service with detector-priority scheduling on each
phone. The architectural requirement is independent cadence and correct result routing.

Drive captures from `requestVideoFrameCallback` where available, with fallback and
rate limiting. Avoid processing the same presented frame repeatedly. Preserve all stop,
page-hide, generation-token and resource-release behavior.

Choose providers per model after short warm-up measurements. In particular, allow a
GPU detector alongside a WASM classifier. Compare steady-state latency and total resource
cost, not just session-creation success. Retain deterministic fallback.

## 3. Replace the species model deliberately

First shortlist a compact mobile classifier fine-tuned for the intended North American
species, including the currently missing birds. Train using realistic detector crops,
background variation and multiple life stages. Merely deleting 473 output classes mostly
changes the final layer; it does not make the feature extractor substantially cheaper.

Compare the current FP32 model against a compact trained model, FP16 on supported GPU
paths, and calibrated static INT8 on the actual WASM runtime. Current Smaller uses
dynamic quantization. ONNX Runtime recommends static quantization for CNNs; representative
calibration images and browser operator compatibility still need validation.

BioCLIP 2 is a useful broader-coverage evaluation reference and possible offline teacher
or embedding source. Its documented zero-/few-shot classification supports experimenting
with new taxa. Its ViT-L/14 architecture is not a demonstrated lightweight phone-browser
replacement. Treat export, memory, startup and accuracy as open work; do not simply ship
a much larger model. A compact student trained with suitable data is a separate project.

Evaluate a bird-focused detector if crop recall remains the limiting factor. Training
for small, partially occluded birds could reduce dependence on many tiles, but its value
must be measured against the current detector at equal device latency and false positives.

Preserve unknown/unsupported results. Temperature calibration and acceptance thresholds
must be fitted on calibration data and checked on untouched test data. A classifier can
be confidently wrong on an unseen bird; a high softmax score is insufficient by itself.

## 4. Use better evidence rather than repeated near-identical votes

Keep a small, in-memory set of the best recent crops per track, bounded by bytes and
age, then dispose of them on track expiry/stop. Rank by usable bird pixels, blur,
exposure and truncation. This would be a new temporary retention policy: current code
only classifies the current frame and does not keep older crops.

For uncertain birds, compare a few sufficiently different views and retain the top
candidates with raw scores and quality metadata. Centralize acceptance and stabilization
in one evidence accumulator. Repeated predictions on almost identical images are not
independent confirmations. Never let an old good crop imply that a bird is still present.

Track association should combine motion, geometry and optionally appearance, especially
when two birds cross. A crop embedding can help, but test identity switches before adding
its compute cost. Allow coarser identification such as a validated family/group when
species evidence is inadequate, using real taxonomy rather than guessed group labels.

## 5. Make camera and discovery work adaptive

Use a bounded compute budget for all detector work, including tracked regions, rather
than budgeting only discovery tiles. Prioritize the visible viewport, a user-selected
bird, stale tracks and regions with useful unexplained motion. Merge overlapping search
regions. Reserve a minimum periodic full-frame/coverage budget so still birds and birds
outside current tracks are not starved.

Measure 1080p, 1440p and 4K capture tiers. Lower sustained resolution can help nearby
birds but harms distant-bird detail; switch with hysteresis based on usable crop size
and measured latency, not an unconditional downgrade. Feature-detected camera zoom and
tap-to-select can make target selection more efficient; digital enlargement adds no detail.

Profile GPU preprocessing to avoid canvas CPU readback on the GPU inference path.
ONNX Runtime supports GPU-buffer inputs/outputs and graph capture under specific
conditions. Graph capture requires static shapes and all relevant kernels on WebGPU.
Keep the existing CPU preprocessing fallback and verify numerical/image preprocessing
parity before accepting this optimization.

## 6. Define extension contracts before adding features

Replace model-index identity with a versioned canonical species catalog. Keep a separate
mapping from each model's output index to species ID. Include scientific/common names,
taxonomy version, source attribution and optional aliases. Do not silently remap historic
observations when a model or taxonomy changes.

Model adapters should declare input/output format, preprocessing, supported species,
hashes, provider capabilities and calibration version. The current experiment validator
hard-codes YOLOX and one regional scope; replace that assumption with explicit adapter
contracts when introducing the next model. Align export and evaluation scripts with the
same contracts.

Emit versioned events such as `track.updated`, `evidence.added`, `identification.changed`
and `observation.ended`. An observation should contain its own ID, time interval,
canonical species candidates, acceptance state, evidence references and model versions.
Keep the transient camera track distinct from a saved sighting; returning after an
occlusion must not automatically mean a new individual or duplicate checklist entry.

This supports incremental additions:

- Species cards and lookalike comparisons from a curated, attributed local catalog.
- A local IndexedDB sightings journal, explicit save/delete, corrections and export.
- Photo import through the same detector/classifier adapters.
- Downloadable region/model packs and a versioned offline cache with quotas and removal.
- Optional broad region/month context to rank plausible candidates without forcing a name.
- Optional local microphone identification as a separate source of evidence.

BirdNET is an audio candidate, not an image-model replacement. Its Analyzer model terms
differ from the code license, and browser conversion/performance require a separate
prototype. A bird heard nearby is not necessarily the bird inside a camera rectangle;
show audio-only observations separately unless association is supported. Do not multiply
audio, image and location scores as though they were independent calibrated probabilities.

## Suggested delivery order

1. Benchmark and stage-timing harness, canonical species/model contracts, shared evidence
   schema. Keep existing behavior while making future comparisons possible.
2. Independent provider selection, bounded detector/classifier scheduling, fresh-frame
   capture. Validate responsiveness and memory under sustained load.
3. Classifier replacement and calibrated acceptance, selected on held-out evidence;
   then crop selection and adaptive discovery experiments.
4. Species details, explicit local sightings and photo import using observation events.
5. Optional audio, region packs and offline operation once core image quality is measured.

Do not begin by increasing inference frequency, lowering confidence thresholds, adding
unbounded tiles or using generative upscaling to invent tiny-bird detail. Those changes
can increase heat or confident errors without solving the missing-species problem.

## Verification performed for this assessment

- Reviewed current page, workers, tracker, manifest, model provenance, conversion scripts,
  evaluation script and browser regression fixtures.
- Ran `node tests/birds-core.mjs` and `node tests/birds-motion.mjs`; both passed.
- Computed current search-window counts at 1920×1080 and 3840×2160: 40 each.
- No live camera, phone benchmark, new-model inference, preview rebuild or deployment.

## Primary sources checked

- [ONNX Runtime Web performance diagnosis](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html): provider choice and performance investigation.
- [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html): GPU buffers and graph capture requirements.
- [ONNX quantization guidance](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html): static/dynamic quantization and calibration.
- [BioCLIP 2 model card](https://huggingface.co/imageomics/bioclip-2): architecture, supported evaluation approaches and limitations; published benchmarks are not this app's accuracy.
- [Video frame callbacks](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback): frame-aligned scheduling.
- [BirdNET Analyzer](https://github.com/birdnet-team/BirdNET-Analyzer/blob/main/README.md): audio model scope and separate model/code terms.
- [BirdNET species-list guidance](https://birdnet-team.github.io/BirdNET-Analyzer/dev/best-practices/species-lists.html): geographic/seasonal context and its interpretation.
