"""Tune a preset's knobs toward single recorded notes, band by band -- the
piano's method (tune_piano.py) for any sound with recordings of its notes.

    uv run tune_bands.py NAME [--evals N]

The score is the octave-band decay table (bands.py) of each of a few keys,
ours against the nearest recorded note, floored at -60 dB.
"""
import glob, json, os, sys, numpy as np, cma
from tune import Renderer
from bands import table
from body import load, midi_of

C = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
FLOOR = -60

BAND_SPECS = {
    'UPRIGHT BASS': {
        'refs': 'vsco/Strings/Solo Contrabass/Pizz/*v1_rr1.wav', 'keys': [31, 36, 43, 50], 'vel': 96,
        'space': [
            ('fe.envA', 0.0005, 0.03, True), ('fe.envD', 0.001, 0.4, True), ('flp.cutoff', 100, 3000, True),
            ('str.wireDamp', 5, 95), ('str.wirePos', 5, 45), ('str.wireStiff', 0, 20),
            ('dec.outLo', 0.5, 8, True), ('dec.outHi', 0.3, 6, True),
            ('sng.level', 0.001, 0.4, True), ('bod.irMix', 0, 100), ('dmp.envR', 0.04, 0.4, True),
        ],
        'start': {'fe.envA': 0.01, 'fe.envD': 0.08, 'flp.cutoff': 400, 'str.wireDamp': 68, 'str.wirePos': 41, 'str.wireStiff': 1,
                  'dec.outLo': 0.62, 'dec.outHi': 4.5, 'sng.level': 0.016, 'bod.irMix': 34, 'dmp.envR': 0.14},
    },
    'HARPSICHORD': {
        'refs': 'vcsl/Chordophones/Zithers/Harpsichord, Flemish/Sustains/Low/*rr1.wav', 'keys': [43, 52, 60, 67, 76], 'vel': 96,
        'space': [
            ('pe.envA', 0.00005, 0.002, True), ('pe.envD', 0.0005, 0.3, True), ('qg.level', 0.02, 2, True),
            ('qul.hardness', 30, 100), ('qul.exTone', 1000, 12000, True),
            ('s1.wireDamp|s2.wireDamp', 0.5, 40, True), ('s1.wirePos|s2.wirePos', 2, 25), ('s1.wireStiff|s2.wireStiff', 0, 30),
            ('s4.wireDamp', 0.5, 40, True), ('g4.level', 0.02, 1, True), ('dk.value', 1.0, 1.004),
            ('dec.outLo', 0.8, 12, True), ('dec.outHi', 0.3, 8, True), ('board.irMix', 0, 100), ('rm.spaceMix', 3, 40),
        ],
        'start': {'pe.envA': 0.0005, 'pe.envD': 0.05, 'qg.level': 0.96, 'qul.hardness': 99, 'qul.exTone': 9500,
                  's1.wireDamp|s2.wireDamp': 4, 's1.wirePos|s2.wirePos': 3.1, 's1.wireStiff|s2.wireStiff': 13.5, 's4.wireDamp': 16,
                  'g4.level': 0.37, 'dk.value': 1.0026, 'dec.outLo': 2.0, 'dec.outHi': 2.9, 'board.irMix': 1.3, 'rm.spaceMix': 25},
    },
}


def run(name, evals):
    spec = BAND_SPECS[name]
    files = {midi_of(f.split('/')[-1]): f for f in glob.glob(os.path.join(C, 'refs', spec['refs']))}
    keys = [min(files, key=lambda k: abs(k - m)) for m in spec['keys']]
    real = {m: table(load(files[m])) for m in keys}
    render = Renderer()
    names = [k for k, *_ in spec['space']]
    lo = np.array([s[1] for s in spec['space']], float); hi = np.array([s[2] for s in spec['space']], float)
    lg = np.array([bool(s[3]) if len(s) > 3 else False for s in spec['space']])
    to = lambda u: {kk: float(v) for k, v in zip(names, np.where(lg, lo * (hi / np.where(lg, lo, 1)) ** np.clip(u, 0, 1), lo + (hi - lo) * np.clip(u, 0, 1))) for kk in k.split('|')}

    from specs import SPECS
    from tune import ref_embedding, score as ear_score
    spec_ear = SPECS.get(name)
    ref = ref_embedding(spec_ear) if spec_ear else None

    def loss(p):
        # What a player hears it as, too: the band table alone tuned the bass
        # into a pure tone that matched its bands and read as a tuner.
        ear = 0.0
        if spec_ear:
            _, info = ear_score(spec_ear, render, ref, p, 'tb', phrases=[0])
            if 'label' not in info:
                return 1e3
            ear = -3 * min(info['label'] / max(info['ceil'], 1e-3), 1.5) + 1.5 * info['avoid']
        err = []
        for m in keys:
            out = os.path.join(C, f'_tb_{m}.wav')
            r = render(name=name, params=p, notes=[{'note': 108 - m, 'at': 0.05, 'dur': 2.5, 'vel': spec['vel']}], seconds=3, out=out)
            if not r['ok']:
                return 1e3
            ours = table(load(out))
            for t in real[m]:
                err += list(np.abs(np.maximum(real[m][t], FLOOR) - np.maximum(ours[t], FLOOR)))
        return float(np.mean(err)) + ear

    start = dict(spec.get('start') or {})
    saved = os.path.join(C, f"tuned_{name.replace(' ', '_')}_bands.json")
    if start and os.path.exists(saved):
        got = json.load(open(saved))['params']
        start.update({k: got[k.split('|')[0]] for k in start if k.split('|')[0] in got})
    x0 = np.clip([(np.log(start[k] / l) / np.log(h / l)) if g else (start[k] - l) / (h - l) for k, l, h, g in zip(names, lo, hi, lg)], 0, 1) if start else np.full(len(names), 0.5)
    best = (loss(to(x0)), to(x0)); print('start', round(best[0], 2), flush=True)
    es = cma.CMAEvolutionStrategy(x0, 0.25, {'bounds': [0, 1], 'maxfevals': evals, 'popsize': 10, 'verbose': -9, 'seed': 7})
    n = 0
    while not es.stop():
        xs = es.ask(); fs = []
        for x in xs:
            f = loss(to(x)); n += 1; fs.append(f)
            if f < best[0]:
                best = (f, to(x)); print(f'{n:4d} best {f:.2f}', flush=True)
                json.dump({'loss': f, 'params': best[1]}, open(os.path.join(C, f"tuned_{name.replace(' ', '_')}_bands.json"), 'w'), indent=1)
        es.tell(xs, fs)
    print('BEST', round(best[0], 2)); render.p.stdin.close()


if __name__ == '__main__':
    run(sys.argv[1], int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 200)
