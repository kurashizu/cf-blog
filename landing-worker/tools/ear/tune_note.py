"""Tune a preset against its recorded notes by what a blind listener hears
(calib.py): the AST distance between each recorded note and our render of
the same pitch, both prepared as the blind trials are, plus the octave bands
to 16 kHz over time as a lighter guide -- tune_drum.py's loss, note for note.

    uv run tune_note.py PRESET [--evals N]

Alternate notes of the bank are fitted and the others held out; the result
is written (.cache/tuned_note_<PRESET>.json, knobs that moved) only when it
is nearer the held-out notes than what ships. apply_note.py puts it into
synth-presets.ts. Level is not a knob here: the loss is loudness-matched and
cannot hear it (loudness.cjs levels the set afterwards).
"""
import json, os, sys, numpy as np, cma
from tune import Renderer
from body import load
from validate import bank, features, SPECS, C
from listen import prepare
from kitdiag import table
from tune_kit import DISCRETE

FLOOR = -60
NOT_KNOBS = ('trim.', 'roomSend.', 'roomRtn.', 'roomOut.')


def main(name, evals):
    spec = SPECS[name]
    R = bank(spec, 12)
    keys = sorted(R)
    fit, hold = keys[0::2], keys[1::2]
    E = {k: features(prepare(R[k]))[1] for k in keys}
    T = {k: np.maximum(table(R[k]), FLOOR) for k in keys}
    r = Renderer()
    info = r(name=name, getParams=True, notes=[], out='')
    base = {k: v for k, v in info['params'].items() if isinstance(v, (int, float)) and v > 0
            and not DISCRETE.match(k.split('.', 1)[1]) and not k.startswith(NOT_KNOBS)}
    names = sorted(base)

    def rng(k):
        nid, knob = k.split('.', 1)
        return (info.get('ranges') or {}).get((info.get('types') or {}).get(nid, ''), {}).get(knob, [0, 1e9])

    lo = np.array([max(base[k] / 4, max(rng(k)[0], 1e-6)) for k in names])
    hi = np.array([min(base[k] * 4, rng(k)[1]) for k in names])
    keep = hi > lo * 1.01
    names = [k for k, ok in zip(names, keep) if ok]
    lo, hi = lo[keep], hi[keep]
    to = lambda u: {k: float(v) for k, v in zip(names, lo * (hi / lo) ** np.clip(u, 0, 1))}
    print(f'{name}: {len(names)} knobs, notes {fit} fitted, {hold} held out', flush=True)

    def score(p, ks):
        band, ast = [], []
        for k in ks:
            path = os.path.join(C, f'_tn_{os.getpid()}.wav')
            q = r(name=name, params=p, notes=[{'note': 108 - k, 'at': 0.05, 'dur': spec.get('held', 1.2), 'vel': 90}], out=path, seconds=2.3)
            if not q['ok'] or q['peak'] < 1e-4:
                return 1e3, 0, 0
            x = load(path)
            os.remove(path)
            band.append(np.mean(np.abs(np.maximum(table(x), FLOOR) - T[k])))
            ast.append(1 - float(features(prepare(x))[1] @ E[k]))
        b, a = float(np.mean(band)), float(np.mean(ast))
        return b + 100 * a, b, a

    x0 = np.clip(np.log(np.array([base[k] for k in names]) / lo) / np.log(hi / lo), 0, 1)
    f0 = score(to(x0), fit)
    best = (f0[0], to(x0))
    print(f'start {f0[0]:.2f} (band {f0[1]:.1f} dB, ast {f0[2]:.3f})', flush=True)
    es = cma.CMAEvolutionStrategy(x0, 0.25, {'bounds': [0, 1], 'maxfevals': evals, 'popsize': 8, 'verbose': -9, 'seed': 5})
    n = 0
    while not es.stop():
        xs = es.ask()
        fs = []
        for x in xs:
            f = score(to(x), fit)
            n += 1
            fs.append(f[0])
            if f[0] < best[0]:
                best = (f[0], to(x))
                print(f'{n:4d} best {f[0]:.2f} (band {f[1]:.1f} dB, ast {f[2]:.3f})', flush=True)
        es.tell(xs, fs)
    h0 = score(to(x0), hold)
    h1 = score(best[1], hold)
    print(f'HELD OUT  shipped band {h0[1]:.1f} dB, ast {h0[2]:.3f}   tuned band {h1[1]:.1f} dB, ast {h1[2]:.3f}')
    r.p.stdin.close()
    out = os.path.join(C, f"tuned_note_{name.replace(' ', '_')}.json")
    if h1[0] < h0[0]:
        moved = {k: round(v, 5) for k, v in best[1].items() if abs(np.log(v / base[k])) > 0.05}
        json.dump({'held_out': {'shipped': h0, 'tuned': h1}, 'moved': moved}, open(out, 'w'), indent=1)
        print('BETTER', out)
    else:
        print('KEPT SHIPPED')


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 160)
