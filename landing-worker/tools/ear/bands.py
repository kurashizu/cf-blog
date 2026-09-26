"""Octave-band decay of one note, ours against the recording: where the energy
is and how fast each band lets go. A plucked string and a struck one differ
here -- which bands carry the note, and the shape of their fall."""
import numpy as np
BANDS = [63, 125, 250, 500, 1000, 2000, 4000, 8000]
TIMES = [0.01, 0.05, 0.15, 0.4, 1.0, 2.0]


def table(x, sr=48000):
    x = x[max(0, np.argmax(np.abs(x) > 0.05 * np.abs(x).max()) - 48):]
    N = 4096
    rows = {}
    for t in TIMES:
        s = int(t * sr)
        seg = x[s:s + N]
        if len(seg) < N: seg = np.pad(seg, (0, N - len(seg)))
        S = np.abs(np.fft.rfft(seg * np.hanning(N))) ** 2
        fr = np.fft.rfftfreq(N, 1 / sr)
        rows[t] = [10 * np.log10(S[(fr >= b / 1.414) & (fr < b * 1.414)].sum() + 1e-20) for b in BANDS]
    ref = max(max(r) for r in rows.values())
    return {t: [v - ref for v in r] for t, r in rows.items()}


def show(name, tab):
    print(f'  {name:5s} ' + ' '.join(f'{b:>6}' for b in BANDS))
    for t, r in tab.items():
        print(f'  {t:5.2f} ' + ' '.join(f'{v:6.0f}' for v in r))
