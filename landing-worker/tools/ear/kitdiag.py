"""Where a kit piece differs from the recordings' hits, before any tuning:
octave-band level over time (to 16 kHz, where a hat and a cymbal live), and
a membrane's strongest resonances. Both averaged over the recordings' takes
and over our key at three velocities, each hit normalised to its own peak.

    uv run kitdiag.py [GM ...]
"""
import glob, os, sys, numpy as np
from tune import Renderer
from body import load
from validate import DRUMS, onset_clip, C

SR = 48000
BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
TIMES = [0.005, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5]


def table(x):
    N = 2048
    ref = None
    rows = []
    for t in TIMES:
        seg = x[int(t * SR):int(t * SR) + N]
        seg = np.pad(seg, (0, N - len(seg)))
        S = np.abs(np.fft.rfft(seg * np.hanning(N))) ** 2
        fr = np.fft.rfftfreq(N, 1 / SR)
        rows.append([10 * np.log10(S[(fr >= b / 1.414) & (fr < b * 1.414)].sum() + 1e-20) for b in BANDS])
    rows = np.array(rows)
    return rows - rows.max()


def modes(x, n=4):
    seg = x[int(0.02 * SR):int(0.25 * SR)]
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    fr = np.fft.rfftfreq(len(seg), 1 / SR)
    band = (fr > 30) & (fr < 800)
    S, fr = S[band], fr[band]
    peaks = [i for i in range(1, len(S) - 1) if S[i] > S[i - 1] and S[i] > S[i + 1]]
    peaks = sorted(peaks, key=lambda i: -S[i])[:n]
    return sorted(round(float(fr[i])) for i in peaks)


def show(label, T):
    print(f'  {label:6s}' + ''.join(f'{b if b < 1000 else str(b // 1000) + "k":>6}' for b in BANDS))
    for t, r in zip(TIMES, T):
        print(f'  {t:6.3f}' + ''.join(f'{v:6.0f}' for v in r))


def main():
    want = [int(a) for a in sys.argv[1:]]
    render = Renderer()
    for gm, what, pattern in DRUMS:
        if want and gm not in want:
            continue
        files = sorted(glob.glob(os.path.join(C, 'refs', pattern)))
        if not files:
            continue
        real = [onset_clip(load(f)) for f in files[:10]]
        ours = []
        for vel in [70, 100, 120]:
            path = os.path.join(C, f'_kd_{os.getpid()}.wav')
            r = render(kit='JAZZ KIT', key=str(108 - gm), params={}, notes=[{'note': 108 - gm, 'at': 0.05, 'dur': 0.3, 'vel': vel}], out=path, seconds=2.3)
            if r['ok']:
                ours.append(onset_clip(load(path)))
            os.remove(path)
        if not ours:
            continue
        R = np.mean([table(x) for x in real], 0)
        O = np.mean([table(x) for x in ours], 0)
        print(f'\n== GM {gm} {what}: {len(real)} recorded hits')
        show('real', R)
        show('ours', O)
        show('diff', O - R)
        if gm in (35, 36, 38, 40, 41, 43, 45, 47, 48, 50):
            print('  modes real', [modes(x) for x in real[:3]], ' ours', [modes(x) for x in ours])
    render.p.stdin.close()


if __name__ == '__main__':
    main()
