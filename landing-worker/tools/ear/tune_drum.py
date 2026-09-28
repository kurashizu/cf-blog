"""Tune one JAZZ KIT piece against the VCSL hits of the same instrument, by
measures that passed validate.py -- not the AudioSet label, which the last
kit was tuned on and which it learnt to please (every piece came out further
from its recordings than a sine with their envelope).

    uv run tune_drum.py GM [--evals N]

The loss is the AST distance the listener's own ears were checked against
(calib.py: of 60 blind trials, 1 - cosine between the pair's AST embeddings
ranked the ones they caught at AUC 0.81, where band tables managed 0.62-0.67):
each recorded take against the nearest of our hits, both prepared as the
listening test prepares them (onset-aligned, loudness-matched). The
octave-band level over time to 16 kHz (kitdiag.py's table, floored at -60 dB)
is added at a lower weight, as a guide to where the energy should be. Both on
half the recorded takes. The other
half is held out and reported at the end: a fit that is only to the takes it
saw shows there. The search starts from the builder's numbers -- the key's
old tuned entry is taken out first -- and each knob moves between a quarter
and four times its value, inside the catalogue's range. Writes
.cache/kit_JAZZ_KIT_<GM>.json for kit_apply.py.
"""
import glob, json, os, sys, time, numpy as np, cma
from tune import Renderer
from body import load
from validate import DRUMS, features, onset_clip, C
from listen import prepare
from kitdiag import table
from tune_kit import DISCRETE
import kit_apply as ka

VELS = [70, 100, 120]
FLOOR = -60


def main(gm, evals):
    what, pattern = next((w, p) for g, w, p in DRUMS if g == gm)
    files = sorted(glob.glob(os.path.join(C, 'refs', pattern)))
    hits = [onset_clip(load(f)) for f in files]
    train, hold = hits[0::2], hits[1::2]
    T_train = np.maximum(np.mean([table(x) for x in train], 0), FLOOR)
    T_hold = np.maximum(np.mean([table(x) for x in hold], 0), FLOOR)
    E_train = np.array([features(prepare(x))[1] for x in train])
    E_hold = np.array([features(prepare(x))[1] for x in hold])

    r = Renderer()
    key = str(108 - gm)
    # What ships now (and what the blind trials heard), for the held-out comparison.
    shipped = r(kit='JAZZ KIT', key=key, getParams=True, notes=[], out='')['params']
    shipped = {k: v for k, v in shipped.items() if isinstance(v, (int, float))}
    original = open(ka.SRC).read()
    ka.clear_entry(gm)  # from the builder's numbers
    time.sleep(4)
    info = r(kit='JAZZ KIT', key=key, getParams=True, notes=[], out='')
    base = {k: v for k, v in info['params'].items() if isinstance(v, (int, float)) and v > 0 and not DISCRETE.match(k.split('.', 1)[1]) and k != 'trim.level'}
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
    print(f'GM {gm} {what}: {len(names)} knobs, {len(train)} takes to fit, {len(hold)} held out', flush=True)

    def ours(p):
        xs = []
        for vel in VELS:
            path = os.path.join(C, f'_td_{os.getpid()}.wav')
            q = r(kit='JAZZ KIT', key=key, params=p, notes=[{'note': int(key), 'at': 0.05, 'dur': 0.3, 'vel': vel}], out=path, seconds=2.3)
            if not q['ok'] or q['peak'] < 1e-4:
                return None
            xs.append(onset_clip(load(path)))
            os.remove(path)
        return xs

    def score(xs, T, E):
        band = float(np.mean(np.abs(np.maximum(np.mean([table(x) for x in xs], 0), FLOOR) - T)))
        O = np.array([features(prepare(x))[1] for x in xs])
        ast = float(np.mean(np.min(1 - E @ O.T, axis=1)))  # each take against our nearest hit
        return band + 100 * ast, band, ast

    def loss(p):
        xs = ours(p)
        return (1e3, 0, 0) if xs is None else score(xs, T_train, E_train)

    x0 = np.clip(np.log(np.array([base[k] for k in names]) / lo) / np.log(hi / lo), 0, 1)
    f0 = loss(to(x0))
    best = (f0[0], to(x0), f0)
    print(f'start {f0[0]:.2f} (band {f0[1]:.1f} dB, ast {f0[2]:.3f})', flush=True)
    es = cma.CMAEvolutionStrategy(x0, 0.25, {'bounds': [0, 1], 'maxfevals': evals, 'popsize': 8, 'verbose': -9, 'seed': gm})
    n = 0
    out = os.path.join(C, f'kit_JAZZ_KIT_{gm}.json')
    while not es.stop():
        xs = es.ask()
        fs = []
        for x in xs:
            f = loss(to(x))
            n += 1
            fs.append(f[0])
            if f[0] < best[0]:
                best = (f[0], to(x), f)
                print(f'{n:4d} best {f[0]:.2f} (band {f[1]:.1f} dB, ast {f[2]:.3f})', flush=True)
                moved = {k: round(v, 5) for k, v in best[1].items() if abs(np.log(v / base[k])) > 0.05}
                json.dump({'score': f[0], 'moved': moved}, open(out, 'w'), indent=1)
        es.tell(xs, fs)
    held = {}
    for what_, p in [('shipped', shipped), ('builder', to(x0)), ('tuned', best[1])]:
        held[what_] = score(ours(p), T_hold, E_hold)
        print(f'HELD OUT  {what_:8s} band {held[what_][1]:.1f} dB, ast {held[what_][2]:.3f}', flush=True)
    r.p.stdin.close()
    # Kept only if it is nearer the takes it never saw than what ships.
    if held['tuned'][0] < held['shipped'][0]:
        open(ka.SRC, 'w').write(original)
        time.sleep(4)
        ka.main([gm])
        print('APPLIED')
    else:
        open(ka.SRC, 'w').write(original)
        print('KEPT SHIPPED')


if __name__ == '__main__':
    main(int(sys.argv[1]), int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 160)
