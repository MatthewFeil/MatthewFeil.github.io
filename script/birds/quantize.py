"""Reproduce Smaller from a trusted local ONNX FP32 source; no API calls or downloads.
Requires onnx==1.17.0 and onnxruntime==1.19.2 in a dedicated environment.
"""
import argparse, tempfile
from pathlib import Path
import onnx
from onnxruntime.quantization import quantize_dynamic, QuantType
parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
model = onnx.load(str(args.source))
if model.opset_import[0].version < 13:
    model = onnx.version_converter.convert_version(model, 13)
onnx.checker.check_model(model)
with tempfile.TemporaryDirectory() as directory:
    normalized = Path(directory) / 'opset13.onnx'
    onnx.save(model, str(normalized))
    quantize_dynamic(str(normalized), str(args.output), weight_type=QuantType.QUInt8)
onnx.checker.check_model(onnx.load(str(args.output)))
print(f'Quantized local model: {args.output}. Update manifest SHA-256 before use.')
