"""A reference phrase cut from real notes on the same timing as render.cjs: is the protocol fair?"""
import glob, sys, numpy as np, soundfile as sf
from body import load, midi_of
from ear import hear, top
SR = 48000
def phrase(pattern, base, held=1.0, step=1.25, rel=0.25, steps=(0, 2, 4, 5, 7, 9, 11, 12)):
    files = {midi_of(f.split('/')[-1]): f for f in sorted(glob.glob(pattern))}
    out = np.zeros(int(10.3 * SR))
    for i, s in enumerate(steps):
        m = min(files, key=lambda k: abs(k - (base + s)))
        x = load(files[m]); x = x / (np.abs(x).max() + 1e-9)
        on = np.argmax(np.abs(x) > 0.05); x = x[max(0, on - 200):]
        n = int((held + rel) * SR); x = x[:n]
        env = np.ones(len(x)); r0 = int(held * SR)
        env[r0:] = np.exp(-np.arange(len(x) - r0) / SR / (rel / 5))
        at = int((0.05 + i * step) * SR)
        out[at:at + len(x)] += (x * env)[:len(out) - at]
    return out / np.abs(out).max() * 0.5
if __name__ == '__main__':
  for pat, base, lab in [(sys.argv[1], int(sys.argv[2]), 'ref')]:
    sf.write('.cache/_ref.wav', phrase(pat, base), SR)
    print(' | '.join(f'{k} {v:.2f}' for k, v in top(hear('.cache/_ref.wav'), 8)))
