"""Evaluate local classifier logits against held-out, labeled bird crops.
No downloads, API calls, or training. Predictions must come from real inference.
Input JSONL: {expected: species ID or null for unknown, logits: [...], latencyMs: number}.
"""
import argparse, json, math
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('predictions', type=Path)
parser.add_argument('--species', required=True, type=Path, help='JSON list matching classifier output order')
parser.add_argument('--threshold', required=True, type=float)
parser.add_argument('--margin', required=True, type=float)
args = parser.parse_args()
names = json.loads(args.species.read_text())
ids = [s['id'] for s in names]
rows = [json.loads(line) for line in args.predictions.read_text().splitlines() if line.strip()]
if not rows or not ids or len(set(ids)) != len(ids):
    raise SystemExit('Require nonempty examples and unique species IDs.')
correct = confident = clear_supported = confident_supported = 0
latencies = []
for row in rows:
    logits = row['logits']
    if len(logits) != len(ids) or not all(math.isfinite(x) for x in logits):
        raise SystemExit('Logits must be finite and match species count.')
    if row['expected'] is not None and row['expected'] not in ids:
        raise SystemExit('Represent unsupported species with expected: null.')
    exp = [math.exp(x-max(logits)) for x in logits]
    p = [x/sum(exp) for x in exp]
    ranked = sorted(range(len(p)), key=p.__getitem__, reverse=True)
    accepted = p[ranked[0]] >= args.threshold and p[ranked[0]] - (p[ranked[1]] if len(p)>1 else 0) >= args.margin
    clear = row.get('clear', True) and row['expected'] is not None
    clear_supported += int(clear)
    confident_supported += int(clear and accepted)
    confident += int(accepted)
    correct += int(accepted and ids[ranked[0]] == row['expected'])
    latency = float(row['latencyMs'])
    if not math.isfinite(latency) or latency < 0:
        raise SystemExit('Latency must be finite and nonnegative.')
    latencies.append(latency)
precision = correct/confident if confident else 0
coverage = confident_supported/clear_supported if clear_supported else 0
latencies.sort()
p95 = latencies[math.ceil(len(latencies)*.95)-1]
print(json.dumps({'examples':len(rows), 'confident':confident, 'precision':precision, 'coverage':coverage, 'p95InferenceMs':p95, 'accuracyTargetsMet': precision>=.9 and coverage>=.7, 'approved':False, 'remainingGates':['Commercial provenance review', 'Real-phone end-to-end latency and ten-minute sessions']}, indent=2))
