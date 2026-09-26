"""What an AudioSet model hears in a render: the instrument, or a synthesizer.

    uv run ear.py FILE.wav [FILE.wav ...]            top labels per file
    uv run ear.py --serve                            JSON lines on stdin/stdout

The preset tests measure numbers a person chose; this measures the one thing
those kept missing -- which instrument the sound is heard as. The model is
AST fine-tuned on AudioSet (527 classes: Violin, Pizzicato, Harpsichord,
Synthesizer, Electric guitar ...), run on the first seconds of each file.
"""
import json, sys
import numpy as np, soundfile as sf, torch
from scipy.signal import resample_poly
from transformers import ASTFeatureExtractor, ASTForAudioClassification

MODEL = 'MIT/ast-finetuned-audioset-10-10-0.4593'
fe = ASTFeatureExtractor.from_pretrained(MODEL)
model = ASTForAudioClassification.from_pretrained(MODEL).eval()
LABELS = model.config.id2label


def load(path, start=0.0, seconds=10.0):
    x, sr = sf.read(path, always_2d=True)
    x = x.mean(1)[int(start * sr):int((start + seconds) * sr)]
    if sr != 16000:
        x = resample_poly(x, 16000, sr)
    peak = np.abs(x).max() or 1
    return (x / peak * 0.5).astype(np.float32)


@torch.no_grad()
def listen(path, start=0.0, seconds=10.0):
    """Label scores, and the model's own summary of the sound (mean of its last layer)."""
    x = load(path, start, seconds)
    inp = fe(x, sampling_rate=16000, return_tensors='pt')
    out = model(**inp, output_hidden_states=True)
    p = torch.sigmoid(out.logits[0]).numpy()
    emb = out.hidden_states[-1][0].mean(0).numpy()
    return {LABELS[i]: float(p[i]) for i in range(len(p))}, emb / np.linalg.norm(emb)


def hear(path, start=0.0, seconds=10.0):
    return listen(path, start, seconds)[0]


def top(scores, n=6):
    return sorted(scores.items(), key=lambda kv: -kv[1])[:n]


if __name__ == '__main__':
    if sys.argv[1:] == ['--serve']:
        for line in sys.stdin:
            q = json.loads(line)
            s = hear(q['path'], q.get('start', 0.0), q.get('seconds', 10.0))
            want = q.get('labels')
            print(json.dumps({'top': top(s, q.get('n', 8)), 'labels': {k: s[k] for k in want} if want else None}), flush=True)
    else:
        for path in sys.argv[1:]:
            print(path.split('/')[-1], ' | '.join(f'{k} {v:.2f}' for k, v in top(hear(path))))
