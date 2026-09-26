"""Voice the PIANO against the Iowa Steinway, band by band.

The AudioSet ear hears a real piano and this one about the same, and a
player does not; what a player hears is in where each note's energy sits and
how each octave band lets go. So the score is that table (bands.py) for five
keys, ours against the recording of the same key, floored at -60 dB where the
recordings reach their own noise.

    uv run tune_piano.py [--evals N]
"""
import json, os, sys, numpy as np, cma
from tune import Renderer
from realplay import play
from bands import table
from body import load

C = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
KEYS = [36, 43, 48, 55, 60, 67, 72, 84]
VEL = 90
FLOOR = -60

# name, lo, hi, log?, how it becomes voicing
SPACE = [
    ('pnoMix', 0, 100, False),
    ('feltHard', 1000, 8000, True),
    ('feltSoft', 300, 2500, True),
    ('contactHard', 0.0005, 0.004, True),
    ('contactSoft', 0.0015, 0.008, True),
    ('cutLong0', -24, 0, False), ('cutLong1', -24, 0, False), ('cutLong2', -24, 0, False), ('cutLong3', -24, 0, False),
    ('damp0', 0, 40, False), ('damp1', 0, 40, False), ('damp2', 0, 20, False), ('damp3', 0, 20, False),
    ('decScale', 0.3, 2.0, True),
    ('promptScale', 0.3, 3, True),
    ('thumpScale', 0.2, 5, True),
    ('drain0', -30, 0, False), ('drain1', -30, 0, False), ('drain2', -30, 0, False),
    ('boardLevel', 0.2, 4, True),
    ('radiate', 60, 400, True),
    ('caseMidHz', 300, 3000, True),
    ('caseMidDb', -15, 6, False),
    ('caseHiDb', -12, 6, False),
    ('cutPrompt0', -24, 0, False), ('cutPrompt1', -24, 0, False), ('cutPrompt2', -24, 0, False),
]
BASE = {'dec': [50, 42.37, 18, 14, 0.8], 'prompt': [0.1715, 0.272, 0.05, 0.05, 0.1552], 'promptLevel': [4, 3.276, 7, 5, 3.5],
        'thump': [0.1, 0.1, 0.25, 1, 1], 'cutLong': [-4.5, -3.697, -4.276, -1.791, -4], 'damp': [6, 4, 2, 5, 2], 'drain': [-24, -20, 0, 0, 0]}
START0 = {'pnoMix': 0, 'feltHard': 2500, 'feltSoft': 600, 'contactHard': 0.002, 'contactSoft': 0.004,
         'cutLong0': -4.5, 'cutLong1': -3.7, 'cutLong2': -4.3, 'cutLong3': -1.8, 'damp0': 6, 'damp1': 4, 'damp2': 2, 'damp3': 5,
         'decScale': 1, 'promptScale': 1, 'thumpScale': 1, 'drain0': -24, 'drain1': -20, 'drain2': -0.1, 'boardLevel': 1.5}


START = dict(START0)
_prev = os.path.join(C, 'tuned_PIANO_bands.json')
if os.path.exists(_prev):
    START.update(json.load(open(_prev))['params'])
START.update({k: v for k, v in {'radiate': 120, 'caseMidHz': 500, 'caseMidDb': -2, 'caseHiDb': -2, 'cutPrompt0': -6, 'cutPrompt1': -5.1, 'cutPrompt2': -0.1}.items() if k not in START})


def voicing(p):
    v = {k: p[k] for k in ('pnoMix', 'feltHard', 'feltSoft', 'contactHard', 'contactSoft', 'boardLevel', 'radiate', 'caseMidHz', 'caseMidDb', 'caseHiDb')}
    v['cutPrompt'] = [p['cutPrompt0'], p['cutPrompt1'], p['cutPrompt2'], 0, 0]
    v['cutLong'] = [p['cutLong0'], p['cutLong1'], p['cutLong2'], p['cutLong3'], BASE['cutLong'][4]]
    v['damp'] = [p['damp0'], p['damp1'], p['damp2'], p['damp3'], BASE['damp'][4]]
    v['dec'] = [d * p['decScale'] for d in BASE['dec']]
    v['promptLevel'] = [d * p['promptScale'] for d in BASE['promptLevel']]
    v['thump'] = [d * p['thumpScale'] for d in BASE['thump']]
    v['drain'] = [p['drain0'], p['drain1'], p['drain2'], 0, 0]
    return v


REAL = {}
def real_table(midi):
    if midi not in REAL:
        REAL[midi] = table(play([{'note': 108 - midi, 'at': 0.05, 'dur': 2.5, 'vel': VEL}], seconds=3))
    return REAL[midi]


def loss(render, p):
    err = []
    for midi in KEYS:
        out = os.path.join(C, f'_pt_{midi}.wav')
        r = render(name='PIANO', piano=voicing(p), notes=[{'note': 108 - midi, 'at': 0.05, 'dur': 2.5, 'vel': VEL}], seconds=3, out=out)
        if not r['ok']:
            return 1e3
        ours, real = table(load(out)), real_table(midi)
        for t in real:
            a = np.maximum(np.array(real[t]), FLOOR); b = np.maximum(np.array(ours[t]), FLOOR)
            err += list(np.abs(a - b))
    return float(np.mean(err))


def main(evals):
    render = Renderer()
    keys = [k for k, *_ in SPACE]
    lo = np.array([s[1] for s in SPACE], float); hi = np.array([s[2] for s in SPACE], float); lg = np.array([s[3] for s in SPACE])
    to = lambda u: {k: float(v) for k, v in zip(keys, np.where(lg, lo * (hi / np.where(lg, lo, 1)) ** np.clip(u, 0, 1), lo + (hi - lo) * np.clip(u, 0, 1)))}
    fr = lambda p: np.clip([(np.log(p[k] / l) / np.log(h / l)) if g else (p[k] - l) / (h - l) for k, l, h, g in zip(keys, lo, hi, lg)], 0, 1)
    x0 = fr(START)
    best = (loss(render, to(x0)), to(x0))
    print('start', round(best[0], 2), flush=True)
    es = cma.CMAEvolutionStrategy(x0, 0.2, {'bounds': [0, 1], 'maxfevals': evals, 'popsize': 10, 'verbose': -9, 'seed': 5})
    n = 0
    while not es.stop():
        xs = es.ask(); fs = []
        for x in xs:
            f = loss(render, to(x)); n += 1; fs.append(f)
            if f < best[0]:
                best = (f, to(x))
                print(f'{n:4d} best {f:.2f}', flush=True)
                json.dump({'loss': f, 'params': best[1], 'voicing': voicing(best[1])}, open(os.path.join(C, 'tuned_PIANO_bands.json'), 'w'), indent=1)
        es.tell(xs, fs)
    print('BEST', round(best[0], 2)); print(json.dumps(voicing(best[1]), indent=1))
    render.p.stdin.close()


if __name__ == '__main__':
    main(int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 200)
