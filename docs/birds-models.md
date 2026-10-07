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
  crops below 24 pixels in their shortest source dimension. Initial uncalibrated experimental thresholds: .30 detector, .65 classifier,
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

## Distant-bird experiment

Camera capture now requests 3840x2160 at 30fps (ideal, with a 30fps maximum); browsers
may provide a lower resolution. Full-frame detection runs at most every 500ms while tracking birds; empty scenes
start with a full-frame scan. Additional square
windows at 65% and 35% of the frame's shorter dimension, with at least 25% overlap.
Windows rotate across frames. Previously found birds are re-detected in tighter
windows on the next frame; old boxes are never returned without fresh detection.
Tile coordinates map back to the original camera frame before global NMS and species
cropping. Interior-edge truncated detections are discarded. The detector remains
416x416, and species crops remain 260x260 from the original capture.

Each analysis advances 1–2 search tiles, chosen from recent detector latency (roughly
90ms target for search work), plus scans needed to re-detect tracked birds. Geometry
messages arrive before species analysis. The UI starts the next capture when the
worker completes, with a minimum 120ms interval and no queued camera frames. Existing
outlines and labels are reused instead of rebuilding DOM nodes, and position smoothing
weights current detections more heavily. Tensor input buffers and preprocessing canvases
are reused to reduce allocation pressure. Camera preview requests 30fps independently.
Discovery still covers both tile scales, but takes more frames than the earlier seven-pass
version. Higher capture resolution and sustained analysis may increase battery/heat.

A 64x64 crop's luminance-Laplacian variance measures relative sharpness. After two
samples, species analysis skips crops below 70% of recent peak sharpness; the baseline
resets after two seconds so changing scenes do not block identification indefinitely.
No older camera image is stored or used in place of the current frame. At most one
bird is classified per frame, selecting the oldest classification first; each bird
waits at least 800ms between classifications. Suggestions expire after two seconds.
Cached suggestions and geometry updates do not count as independent confirmations:
a tentative label still requires three real agreeing classifier results.

Classifier resizing uses high-quality browser smoothing for source crops whose shortest
dimension is 64–160 pixels. Other sizes keep the source nearest-neighbor preprocessing.
On the one robin fixture, smooth resizing helped a moderately small crop, but an even
smaller crop gave an incorrect species; smoothing is therefore restricted. These are
experimental thresholds, not evidence of an overall accuracy improvement.

`tests/birds-distance-browser.cjs` uses the same labeled photo at 160, 96 and 72 pixels
wide in a 1920x1080 gray scene and a blank scene, with real local ONNX inference.
Set BIRDS_ROBIN_PHOTO, PLAYWRIGHT_MODULE_PATH and PLAYWRIGHT_EXECUTABLE_PATH as for the
model test. Optional BIRDS_BASELINE_WORKER points to a saved pre-change worker for
comparison; optional BIRDS_DISTANCE_REPORT saves JSON results. These are controlled
synthetic small-image tests, not measured field distances or broad accuracy validation.

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
only drew Bird after distance scanning was added. Illustrative last-frame desktop-browser
timings were .29s, .44s and .08s respectively. These are smoke-test observations, not an accuracy benchmark or
phone performance guarantee. Test photo stays outside shipped website assets.
No page errors, remote requests or uploads occurred in that comparison.

Cold-start distance comparison on the 1920x1080 synthetic scene: the previous full-frame
pass missed the robin at all three photo sizes (160, 96, 72 pixels). The new detector
found each: detections on 12/12, 9/12 and 9/12 analyzed frames respectively, with about
102–107ms mean detection-only work per frame on desktop Chrome. Each final result had
one aligned outline, and blank frames returned no birds. Species accuracy at those
sizes was not established. This does not imply a range in meters or phone timing.

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

## Responsiveness comparison (2026-10-06)

On the same 640x640 synthetic robin camera feed, six-second desktop Chrome samples with
the Smaller model measured 1.83 outline updates/sec and 447ms average result age in the
previous distance-scanning version, versus 7.17 updates/sec and 97ms in this revision.
The responsive version sends outlines before classification and ran seven fresh
classifications across 42 completed frames. These figures are desktop observations,
not phone or ten-minute-session evidence. Individual displayed analysis times can
exclude classification when a recent suggestion is reused.

The revised distance fixture still found all three small images (160, 96, 72 pixels),
with one final outline apiece; blank scenes remained empty. Detection-only work averaged
48–51ms per frame in that run. No uploads or remote inference requests occurred.

Sharpness unit checks distinguish sharp edges, uniform crops and blurred edges. In an
additional camera fixture, mild blur remained usable and was classified; stronger blur
caused YOLOX to lose the bird before the crop gate could act. The sharpness gate does
not solve detection under defocus, and phone-level benefit remains unverified.
