"""The piano across its keyboard, against the Iowa Steinway, key for key.

What bands.py cannot see, because it normalises every note to itself: how
loud each key is against the others, and how far its strike stands over its
tone. The tuned PIANO had both upside down -- a spike a period into the note
and a tone 11 dB under its neighbours, so a chord's attack came out as a
knock -- and nothing in the loss could have noticed.

Per key, ours and the recording's, at mf and ff:
    level  the tone (0.3-0.7 s RMS) against C4's, dB
    crest  the loudest sample in the first 0.3 s over that tone, dB
    at     when that loudest sample falls, ms after the onset
Iowa names its files in scientific pitch (C4 is middle C), checked by an
autocorrelation of C2, C4 and C6 when this was written.

    uv run keyboard.py [--piano overrides.json]
"""
import json, os, sys, numpy as np
from tune import Renderer
from body import load

HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, '.cache')
REFS = os.path.join(C, 'refs', 'iowa-piano')
SR = 48000
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
KEYS = list(range(24, 109, 6))  # C1 to C8, every tritone
DYN = {'mf': 80, 'ff': 118}
TABLE = {}


def name(midi):
    return f'{NAMES[midi % 12]}{midi // 12 - 1}'


def onset(x):
    return max(0, int(np.argmax(np.abs(x) > np.abs(x).max() * 0.05)) - int(0.005 * SR))


def describe(x):
    x = x[onset(x):]
    head = np.abs(x[:int(0.3 * SR)])
    tone = x[int(0.3 * SR):int(0.7 * SR)]
    level = 10 * np.log10(np.mean(tone ** 2) + 1e-20)
    return level, 20 * np.log10(head.max() + 1e-10) - level, 1000 * np.argmax(head) / SR


def real(midi, dyn):
    p = os.path.join(REFS, f'Piano.{dyn}.{name(midi)}.wav')
    if not os.path.exists(p):
        return None
    return describe(load(p))


def ours(render, midi, vel, piano):
    out = os.path.join(C, f'_kb_{os.getpid()}.wav')
    q = {'name': 'PIANO', 'params': {}, 'notes': [{'note': 108 - midi, 'at': 0.05, 'dur': 1.5, 'vel': vel}], 'out': out, 'seconds': 2}
    if piano:
        q['piano'] = piano
    r = render(**q)
    assert r['ok'], r
    d = describe(load(out))
    os.remove(out)
    return d


def main():
    piano = json.load(open(sys.argv[sys.argv.index('--piano') + 1])) if '--piano' in sys.argv else None
    render = Renderer()
    rows = {}
    for dyn, vel in DYN.items():
        R = {k: real(k, dyn) for k in KEYS}
        O = {k: ours(render, k, vel, piano) for k in KEYS}
        r4, o4 = R[60][0], O[60][0]
        print(f'\n{dyn} (ours at vel {vel})    level vs C4     crest          peak at')
        print('key     real   ours   diff | real  ours  diff | real  ours ms')
        for k in KEYS:
            if not R[k]:
                continue
            rl, rc, rt = R[k]
            ol, oc, ot = O[k]
            rows[(dyn, k)] = (ol - o4 - (rl - r4), oc - rc)
            TABLE[(dyn, k)] = {'real': rl - r4, 'ours': ol - o4, 'crest_real': rc, 'crest_ours': oc}
            print(f'{name(k):4s} {rl - r4:+6.1f} {ol - o4:+6.1f} {ol - o4 - (rl - r4):+6.1f} | {rc:5.1f} {oc:5.1f} {oc - rc:+5.1f} | {rt:4.0f} {ot:5.0f}')
    lv = np.array([v[0] for v in rows.values()])
    cr = np.array([v[1] for v in rows.values()])
    print(f'\nrms error: level {np.sqrt(np.mean(lv ** 2)):.1f} dB, crest {np.sqrt(np.mean(cr ** 2)):.1f} dB')
    if '--json' in sys.argv:
        json.dump({f'{d} {k}': v for (d, k), v in TABLE.items()}, open(sys.argv[sys.argv.index('--json') + 1], 'w'))
    render.p.stdin.close()


if __name__ == '__main__':
    main()
