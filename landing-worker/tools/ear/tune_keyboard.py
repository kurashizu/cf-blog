"""Tune the PIANO's treble against keyboard.py's table: the tone's level
against C4's and the strike's crest over it, key for key, mf and ff.

The band tables normalise each note to itself, so the treble could lose its
tone to a click -- C7 41 dB of crest where the Steinway has 23, C8's tone 30
dB under the recording's -- and nothing they measure moved. The knobs are the
treble's anchors of the string's decay, loss, prompt string and knock; the
level by key is then set straight from the table (it is a gain, and the
crest does not depend on it).

    uv run tune_keyboard.py [--evals N]
"""
import json, os, sys, numpy as np, cma
from tune import Renderer
from keyboard import real, ours, DYN
import re

# The voicing as shipped, read from grand-piano.ts, so this starts where the
# preset is rather than from a copy that drifts.
_TS = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'lib', 'stores', 'grand-piano.ts')).read()
VOICING = {m.group(1): json.loads(m.group(2)) for m in re.finditer(r'^\t(\w+): (\[[^\]]*\]) as By', _TS, re.M)}

C = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
SAVE = os.path.join(C, 'tuned_PIANO_keyboard.json')
KEYS = [60, 78, 84, 90, 96, 102, 108]  # C4, then Gb5 to C8

# voicing field, anchor index (0 A0, 1 C2, 2 C4, 3 C6, 4 C8), lo, hi, log?
SPACE = [
    ('dec', 3, 1, 30, True), ('dec', 4, 0.2, 10, True),
    ('damp', 3, 0, 40, False), ('damp', 4, 0, 40, False),
    ('prompt', 3, 0.05, 1, True), ('prompt', 4, 0.05, 1, True),
    ('promptLevel', 3, 0.3, 6, True), ('promptLevel', 4, 0.3, 6, True),
    ('knock', 3, 0.1, 4, True), ('knock', 4, 0.1, 4, True),
    ('blow', 3, 0.1, 3, True), ('blow', 4, 0.05, 2, True),
]


def voicing(x):
    v = {k: list(VOICING[k]) for k in {f for f, *_ in SPACE}}
    for (f, i, lo, hi, lg), u in zip(SPACE, x):
        u = min(1, max(0, u))
        v[f][i] = lo * (hi / lo) ** u if lg else lo + (hi - lo) * u
    return v


def to_unit(f, i, lo, hi, lg):
    val = VOICING[f][i]
    return float(np.log(val / lo) / np.log(hi / lo)) if lg else (val - lo) / (hi - lo)


def main(evals):
    render = Renderer()
    R = {(d, k): real(k, d) for d in DYN for k in KEYS}

    def loss(x):
        v = voicing(x)
        err = []
        for d, vel in DYN.items():
            O = {k: ours(render, k, vel, v) for k in KEYS}
            for k in KEYS[1:]:
                if not R[(d, k)]:
                    continue  # Iowa has no mf Gb7
                rl, rc, _ = R[(d, k)]
                ol, oc, _ = O[k]
                err += [(ol - O[60][0]) - (rl - R[(d, 60)][0]), oc - rc]
        return float(np.sqrt(np.mean(np.square(err))))

    x0 = [min(1, max(0, to_unit(*s))) for s in SPACE]
    print('start', round(loss(x0), 2), flush=True)
    es = cma.CMAEvolutionStrategy(x0, 0.2, {'bounds': [0, 1], 'maxfevals': evals, 'verbose': -9, 'seed': 3})
    best = (loss(x0), x0)
    while not es.stop():
        xs = es.ask()
        fs = [loss(x) for x in xs]
        es.tell(xs, fs)
        i = int(np.argmin(fs))
        if fs[i] < best[0]:
            best = (fs[i], xs[i])
            json.dump({'loss': best[0], 'voicing': voicing(best[1])}, open(SAVE, 'w'), indent=1)
        print(es.countevals, 'best', round(best[0], 2), flush=True)
    print('BEST', round(best[0], 2), json.dumps(voicing(best[1])))
    render.p.stdin.close()


if __name__ == '__main__':
    main(int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 120)
