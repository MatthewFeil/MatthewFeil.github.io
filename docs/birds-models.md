# Bird Detection — unlisted local model comparison

Updated 2026-10-06. This page now runs **real local models** in an explicitly
experimental mode. It is unlisted (removed from My Work and not added to navigation),
noindex, sitemap:false and has no analytics. No deployment or publication was performed.
An unlisted URL is not authentication; a visitor with its URL may still open it.

## Options

| Selector | Weights | What it does |
|---|---|---|
| Full precision (default) | EfficientNet-B2 FP32, 33.7 MB | Names detected birds using 525 source labels |
| Smaller | Locally quantized EfficientNet-B2 QUInt8, 9.0 MB | Same label set, smaller download, potentially reduced identification quality |
| Detection only | YOLOX-Nano, 3.7 MB | Draws bird outlines, no species names |

All options share YOLOX-Nano; full and smaller add a classifier. ONNX Runtime's
26 MB WASM runtime is loaded locally. Only the selected classifier is downloaded.
The full-precision model is the default because it named the labeled robin photo in
our browser smoke test while the quantized model stayed uncertain on the detected crop.
The options are not three independently trained species classifiers; Smaller is a
quantized version of Full precision. Speed benefits must be measured on the user's phone.

## Sources and restrictions

`assets/models/birds/SOURCES.md` and per-model MODEL_CARD.md/LICENSE/SOURCE.md record
upstream URLs, fixed revisions, transformations and upstream declared licenses.
YOLOX and the selected EfficientNet source declare Apache-2.0. Training images include
COCO/Kaggle/ImageNet sources; image-level commercial provenance remains unverified.
These are user-authorized, unlisted, noncommercial experiments, not commercially cleared
release models. Source benchmark accuracy is not our camera accuracy.

The ozzyonfire checkpoint was tested locally and excluded: nearly uniform predictions
on a real labeled robin image. Its downloaded weights were moved outside the website.
Other previously reviewed noncommercial/NABirds-based classifiers remain excluded.

## Processing details

- Detector: upstream YOLOX 416x416, top-left letterbox with value 114, BGR float32
  values in 0..255, NCHW. Decode 3549x85 raw head using strides 8/16/32. Bird class 14,
  objectness times bird-class score, NMS, inverse letterboxing to normalized source boxes.
- Classifier: 260x260 RGB nearest-neighbor resize, rescale 1/255, source mean and std.
  Upstream EfficientNet `include_top` normalizes a second time: effective std is
  source std squared. This detail is essential; do not use the old generic adapter.
- Classify up to three detections per frame, adding 5% crop context and rejecting tiny
  crops. Initial uncalibrated experimental thresholds: .30 detector, .65 classifier,
  .20 top-two margin. Raw model scores are not presented as accuracy percentages.
- Three agreeing recent classifications yield a tentative name; slow-device tracking
  tolerates longer inference intervals. Never force a name for an uncertain result.
- Worker sessions prefer WebGPU for FP32/detection where available, otherwise WASM.
  Quantized option uses WASM. One active frame, no request backlog; nominal 2Hz cadence.
- Switching models terminates the previous worker and clears its overlays while
  retaining the camera. Generation tokens reject old results, timeouts provide recovery,
  and model-start changes cannot race with pending camera startup.
- SHA-256 is checked before loading weights; model requests include a hash cache key.
  Stop, hidden page and pagehide release tracks and workers. Rotation rejects results
  from previous frame dimensions. Control remains accessible in safe areas.

`release.approved` remains false. `experimental.enabled` and whitelisted options allow
local testing separately; production approval is not fabricated or silently waived.
No AI APIs, image uploads, analytics or telemetry. Only same-origin static downloads.
There is no service worker, so offline availability is not promised.

## What was tested

Production Jekyll build, JS/Python syntax and focused geometry/YOLOX/release-gate tests.
Chromium camera lifecycle at 320x568, 390x844, 844x390 and 1440x900: start/stop/resume,
permission denial, interrupted camera, no overflow and GET-only same-origin traffic.
These lifecycle checks use synthetic camera input, not physical phones.

Real downloaded model graphs passed Python ONNX validation and local CPU inference.
A labeled American robin photograph by Pranav Tadepalli (CC BY-SA 4.0) was supplied as a
synthetic browser camera feed:
https://commons.wikimedia.org/wiki/File:American_Robin_Closeup.jpg

Full precision displayed American Robin, Smaller drew an uncertain bird, and Detection
only drew Bird. Illustrative last-frame desktop-browser timings were .19s, .16s and
.03s respectively. These are smoke-test observations, not an accuracy benchmark or
phone performance guarantee. Test photo stays outside shipped website assets.
No page errors, remote requests or uploads occurred in that comparison.

`tests/birds-models-browser.cjs` repeats real inference when BIRDS_ROBIN_PHOTO points to
that local labeled image. It operates on BIRDS_MODEL_URL (default localhost:4001).
`tests/birds-browser.cjs` starts and closes a temporary server against a production build
and tests the failure/recovery lifecycle without repeatedly loading large real models.

## How to compare on your phone

1. Open /birds/, select Full precision, and tap Start camera. Allow the first download.
2. Use a known bird photo, filling a reasonable part of the frame. Hold steady for
   several analyses and note the tentative name, outline, uncertainty and duration.
3. Switch to Smaller without moving the phone. Compare the same bird and framing.
4. Switch to Detection only if there is no outline. If it cannot find the bird, the
   problem is detection/framing, rather than species classification.
5. Repeat with several known species and an empty scene. Report model, expected species,
   shown name/uncertainty, last-analysis duration, phone/browser and any heating.

Before a validated commercial/public release: independent held-out accuracy and unknown
species tests, 90% confident precision / 70% clear-species coverage targets, end-to-end
stable suggestions within 3s, image-level provenance review and real iPhone/Android
10-minute heat/memory/performance tests remain required. None are claimed complete.
