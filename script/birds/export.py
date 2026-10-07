"""Export a trusted, locally supplied TorchScript model to ONNX. No downloads.
Detector must return normalized xyxy boxes, scores, labels (bird class configured).
Classifier must return logits in species-manifest order. Wrap architectures beforehand.
"""
import argparse
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('model', type=Path, help='Trusted TorchScript model')
parser.add_argument('output', type=Path)
parser.add_argument('--kind', choices=['detector','classifier'], required=True)
parser.add_argument('--width', type=int, required=True)
parser.add_argument('--height', type=int, required=True)
args = parser.parse_args()
import torch
import onnx
model = torch.jit.load(str(args.model), map_location='cpu').eval()
outputs = ['boxes','scores','labels'] if args.kind == 'detector' else ['logits']
dynamic = {name:{0:'detections'} for name in outputs} if args.kind == 'detector' else None
with torch.inference_mode():
    torch.onnx.export(model, torch.zeros(1,3,args.height,args.width), str(args.output), input_names=['images'], output_names=outputs, dynamic_axes=dynamic, opset_version=17, dynamo=False)
onnx.checker.check_model(onnx.load(str(args.output)))
print(f'Export verified: {args.output}. License and accuracy approval are separate.')
