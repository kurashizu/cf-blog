"""Voice the PIANO against the Iowa Steinway, band by band.

The AudioSet ear hears a real piano and this one about the same, and a
player does not; what a player hears is in where each note's energy sits and
how each octave band lets go. So the score is that table (bands.py) for eight
keys at mf and C4 at ff, ours against the recording of the same key, floored
at -60 dB where the recordings reach their own noise. With --ear the AudioSet
score on the keyboard passage joins it (slower; the band tables alone once
tuned the unison to two cents, which they liked and the ear heard as a
plucked string's twang).

The knobs are grandPiano()'s voicing (grand-piano.ts); the knock, the unison's
detune and the level by key are left out -- the tables cannot hear loudness,
and those three were set by ear and by level against the rest of the set.

    uv run tune_piano.py [--evals N] [--ear] [--fresh]
"""
import json, os, sys, numpy as np, cma
from tune import Renderer, ref_embedding, score
from specs import SPECS
from realplay import play
from bands import table
from body import load

C = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
SAVE = os.path.join(C, 'tuned_PIANO_bands.json')
KEYS = [(36, 90), (43, 90), (48, 90), (55, 90), (60, 90), (67, 90), (72, 90), (84, 90), (60, 120)]
FLOOR = -60

# name, lo, hi, log?
SPACE = [
    ('body', 0.5, 12, True), ('radiate', 40, 400, True), ('caseMidHz', 300, 3000, True),
    ('caseMidDb', -15, 6), ('caseHiDb', -12, 6),
    ('feltHard', 1000, 8000, True), ('feltSoft', 300, 2500, True),
    ('blow0', 0.3, 6, True), ('blow1', 0.3, 6, True), ('blow2', 0.2, 4, True), ('blow3', 0.1, 3, True), ('blow4', 0.05, 2, True),
    ('knockHz', 60, 600, True), ('knockQ', 0.7, 12, True),
    ('cutLong0', -24, 0), ('cutLong1', -24, 0), ('cutLong2', -24, 0), ('cutLong3', -24, 0),
    ('damp0', 0, 40), ('damp1', 0, 40), ('damp2', 0, 20), ('damp3', 0, 30),
    ('decScale', 0.3, 2, True), ('promptScale', 0.3, 3, True), ('shareScale', 0.3, 3, True),
    ('boardLevel', 0.2, 4, True),
]
# The voicing the scales multiply, and where the search starts: grand-piano.ts as shipped.
BASE = {'dec': [25.7, 21.8, 9.3, 7.2, 0.41], 'prompt': [0.408, 0.648, 0.119, 0.119, 0.37],
        'promptLevel': [2.06, 1.68, 3.59, 2.57, 1.81]}
START = {'body': 9, 'radiate': 46, 'caseMidHz': 861, 'caseMidDb': -10.4, 'caseHiDb': -0.09,
         'feltHard': 4411, 'feltSoft': 353, 'blow0': 5.77, 'blow1': 1.55, 'blow2': 3.63, 'blow3': 0.294, 'blow4': 0.297,
         'knockHz': 267, 'knockQ': 0.72,
         'cutLong0': -4.19, 'cutLong1': -2.3, 'cutLong2': -1.35, 'cutLong3': -0.16,
         'damp0': 19.6, 'damp1': 0.21, 'damp2': 2.39, 'damp3': 26.8,
         'decScale': 1, 'promptScale': 1, 'shareScale': 1, 'boardLevel': 1.06}
if os.path.exists(SAVE) and '--fresh' not in sys.argv:
    START.update({k: v for k, v in json.load(open(SAVE))['params'].items() if k in START})


def voicing(p):
    v = {k: p[k] for k in ('body', 'radiate', 'caseMidHz', 'caseMidDb', 'caseHiDb', 'feltHard', 'feltSoft', 'knockHz', 'knockQ', 'boardLevel')}
    v['blow'] = [p[f'blow{i}'] for i in range(5)]
    v['cutLong'] = [p['cutLong0'], p['cutLong1'], p['cutLong2'], p['cutLong3'], -4]
    v['damp'] = [p['damp0'], p['damp1'], p['damp2'], p['damp3'], 2]
    v['dec'] = [min(30, d * p['decScale']) for d in BASE['dec']]
    v['promptLevel'] = [d * p['promptScale'] for d in BASE['promptLevel']]
    v['prompt'] = [min(1, d * p['shareScale']) for d in BASE['prompt']]
    return v


REAL = {}
def real_table(midi, vel):
    if (midi, vel) not in REAL:
        REAL[(midi, vel)] = table(play([{'note': 108 - midi, 'at': 0.05, 'dur': 2.5, 'vel': vel}], seconds=3))
    return REAL[(midi, vel)]


def main(evals, use_ear):
    render = Renderer()
    spec = SPECS['PIANO']
    ref = ref_embedding(spec) if use_ear else None

    def loss(p):
        v = voicing(p)
        err = []
        for midi, vel in KEYS:
            out = os.path.join(C, f'_pt_{midi}_{vel}.wav')
            r = render(name='PIANO', piano=v, notes=[{'note': 108 - midi, 'at': 0.05, 'dur': 2.5, 'vel': vel}], seconds=3, out=out)
            if not r['ok']:
                return 1e3, {}
            ours, real = table(load(out)), real_table(midi, vel)
            for t in real:
                err += list(np.abs(np.maximum(np.array(real[t]), FLOOR) - np.maximum(np.array(ours[t]), FLOOR)))
        info = {'bands': round(float(np.mean(err)), 2)}
        f = float(np.mean(err))
        if use_ear:
            _, e = score(spec, lambda **q: render(**q, piano=v), ref, {}, 'piano', phrases=[0])
            if 'label' not in e:
                return 1e3, {}
            f += -3 * min(e['label'] / max(e['ceil'], 1e-3), 1.5) + 1.5 * e['avoid']
            info.update(label=e['label'], avoid=e['avoid'])
        return f, info

    keys = [s[0] for s in SPACE]
    lo = np.array([s[1] for s in SPACE], float); hi = np.array([s[2] for s in SPACE], float)
    lg = np.array([bool(s[3]) if len(s) > 3 else False for s in SPACE])
    to = lambda u: {k: float(x) for k, x in zip(keys, np.where(lg, lo * (hi / np.where(lg, lo, 1)) ** np.clip(u, 0, 1), lo + (hi - lo) * np.clip(u, 0, 1)))}
    fr = lambda p: np.clip([(np.log(p[k] / l) / np.log(h / l)) if g else (p[k] - l) / (h - l) for k, l, h, g in zip(keys, lo, hi, lg)], 0, 1)
    x0 = fr(START)
    f0, i0 = loss(to(x0))
    best = (f0, to(x0), i0)
    print('start', round(f0, 3), i0, flush=True)
    es = cma.CMAEvolutionStrategy(x0, 0.15, {'bounds': [0, 1], 'maxfevals': evals, 'popsize': 10, 'verbose': -9, 'seed': 11})
    n = 0
    while not es.stop():
        xs = es.ask(); fs = []
        for x in xs:
            f, info = loss(to(x)); n += 1; fs.append(f)
            if f < best[0]:
                best = (f, to(x), info)
                print(f'{n:4d} best {f:.3f}', info, flush=True)
                json.dump({'loss': f, 'info': info, 'params': best[1], 'voicing': voicing(best[1])}, open(SAVE, 'w'), indent=1)
        es.tell(xs, fs)
    print('BEST', round(best[0], 3), best[2]); print(json.dumps(voicing(best[1]), indent=1))
    render.p.stdin.close()


if __name__ == '__main__':
    main(int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 200, '--ear' in sys.argv)
