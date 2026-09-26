"""Every tuned preset, heard twice on each of tune.py's phrases: the target
label's mean against the recordings' own score on the same phrases.

    uv run verify.py [NAME ...]
"""
import sys, numpy as np
from tune import Renderer, ref_embedding, score
from specs import SPECS
names = sys.argv[1:] or list(SPECS)
render = Renderer()
for name in names:
    spec = SPECS[name]
    ref = ref_embedding(spec)
    runs = [score(spec, render, ref, {}, 'verify')[1] for _ in range(2)]
    lab = np.mean([r['label'] for r in runs]); bad = np.mean([r['avoid'] for r in runs])
    print(f"{name:14s} {spec['labels'][0][:16]:16s} {lab:.3f}  (recordings {runs[0]['ceil']:.3f})  wrong-family {bad:.2f}", flush=True)
render.p.stdin.close()
