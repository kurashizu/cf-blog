"""Real drum hits from VCSL, eight in a row as kit_survey.py plays ours: the
ceiling each kit label can reach on this protocol."""
import glob, numpy as np, soundfile as sf
from body import load
from ear import hear, top
V = '.cache/refs/vcsl/'
REAL = {
    'kick': ('Membranophones/Struck Membranophones/Bass Drum 2/*hit*', 'Bass drum'),
    'snare': ('Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v3*', 'Snare drum'),
    'tom': ('Membranophones/Struck Membranophones/Tom 1/*_v2_*', 'Drum'),
    'hat closed': ('Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC*', 'Hi-hat'),
    'hat open': ('Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitO*', 'Hi-hat'),
    'cymbal': ('Idiophones/Struck Idiophones/Suspended Cymbal 1/*hit_mf*', 'Cymbal'),
    'clap': ('Idiophones/Struck Idiophones/Claps/SoloClap*', 'Clapping'),
    'cowbell': ('Idiophones/Struck Idiophones/Cowbells/Cowbell1_Hit*', 'Cowbell'),
    'woodblock': ('Idiophones/Struck Idiophones/Woodblock/wood_click*', 'Wood block'),
}
skip = {'Music', 'Musical instrument', 'Percussion'}
def eight(path, step=0.5, n=8, sr=48000):
    x = load(path); x = x[np.argmax(np.abs(x) > 0.05 * np.abs(x).max()):]
    out = np.zeros(int((0.05 + n * step + 0.6) * sr))
    for i in range(n):
        a = int((0.05 + i * step) * sr); seg = x[:len(out) - a]; out[a:a + len(seg)] += seg
    return out / (np.abs(out).max() + 1e-9) * 0.5
if __name__ == '__main__':
    for name, (pat, lab) in REAL.items():
        f = sorted(glob.glob(V + pat))
        if not f: print(name, 'no file'); continue
        sf.write('.cache/_realkit.wav', eight(f[0]), 48000); s = hear('.cache/_realkit.wav', seconds=4.6)
        print(f'{name:10s} {lab:10s} {s[lab]:.2f}  heard:', ' | '.join(f'{k} {v:.2f}' for k, v in top(s, 7) if k not in skip), '  <', f[0].split('/')[-1])
