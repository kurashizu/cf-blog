"""A kit heard playing: a jazz swing bar pattern on ride, hat, snare and kick,
rendered key by key and mixed, and what the ear hears in the whole."""
import sys, numpy as np, soundfile as sf
from tune import Renderer
from body import load
from ear import hear, top
SR = 48000
BPM = 140; beat = 60 / BPM; sw = beat * 2 / 3  # swung eighth: the 'and' two thirds through the beat
def pattern(bars=5):
    ev = {51: [], 42: [], 44: [], 38: [], 36: []}
    for b in range(bars):
        t0 = 0.1 + b * 4 * beat
        for q in range(4):
            ev[51].append((t0 + q * beat, 90))                     # ride on every beat
            if q in (1, 3): ev[51].append((t0 + q * beat + sw, 70))  # and the skip note
            if q in (1, 3): ev[44].append((t0 + q * beat, 85))     # hat foot on 2 and 4
        ev[36].append((t0, 60)); ev[36].append((t0 + 2 * beat, 55))  # feathered kick
        ev[38].append((t0 + 3 * beat + sw, 70))                    # a comping snare
        if b % 2: ev[38].append((t0 + 1 * beat + sw, 55))
    return ev
def render(kit, r, out='.cache/_groove.wav', seconds=10.3):
    mix = np.zeros(int(seconds * SR))
    for gm, hits in pattern().items():
        k = 108 - gm
        res = r(kit=kit, key=str(k), notes=[{'note': k, 'at': t, 'dur': 0.15, 'vel': v} for t, v in hits], seconds=seconds, out='.cache/_gk.wav')
        if res['ok']:
            x = load('.cache/_gk.wav'); mix[:len(x)] += x[:len(mix)]
    sf.write(out, mix / (np.abs(mix).max() + 1e-9) * 0.5, SR)
    return out
if __name__ == '__main__':
    r = Renderer()
    for kit in sys.argv[1:] or ['JAZZ KIT']:
        s = hear(render(kit, r))
        print(kit, '| Drum kit', round(s['Drum kit'], 3), '| Jazz', round(s['Jazz'], 3), '| heard:', ' | '.join(f'{k} {v:.2f}' for k, v in top(s, 8)))
    r.p.stdin.close()
