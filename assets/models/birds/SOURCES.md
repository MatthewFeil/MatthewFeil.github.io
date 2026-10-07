# Experimental model sources

Downloaded for the user-requested unlisted, noncommercial comparison on 2026-10-06.
All runtime files are self-hosted; no Hugging Face or AI API call occurs during use.

- YOLOX-Nano weights: https://github.com/Megvii-BaseDetection/YOLOX/releases/download/0.1.1rc0/yolox_nano.onnx ; project Apache-2.0 license stored alongside. COCO pretrained bird class is 14 (zero-based).
- Species classifier: https://huggingface.co/dennisjooo/Birds-Classifier-EfficientNetB2/tree/4748f6dd9363f45dd2b3ddeb3d5714f54932f7e9 ; upstream Apache-2.0 declaration and model card stored alongside. 525 mostly worldwide labels, including American robin. Kaggle/ImageNet image-level commercial provenance remains unverified; not represented as commercially cleared.
- Smaller classifier: locally quantized derivative of the above; SOURCE.md records transformation. Apache license retained.
- Excluded alternative: ozzyonfire/bird-species-classifier revision d4d80527be1343dacfe67af84d064ca6f9b7547e. Declared MIT but returned nearly uniform predictions in a real robin smoke test. Weights moved outside site; no UI option offered.

Published model-card benchmark scores are not this app's live-camera accuracy. Experimental thresholds (.30 detection, .65 classifier, .20 margin) are initial test defaults, not validated calibration. The release.approved flag remains false.
