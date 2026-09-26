"""Tune a preset's knobs toward a real instrument, by ear.

    uv run tune.py SPEC_NAME [--evals N]

The score is what the AudioSet model hears: how much of the target label
(against what the real recordings score on the same phrase), plus how close
the model's own summary of the render is to its summary of the recordings.
CMA-ES moves the knobs; each evaluation is a render through the real engine.
"""
import json, os, subprocess, sys, time
import numpy as np, cma
from ear import listen
from refphrase import phrase
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, '.cache')


class Renderer:
    def __init__(self):
        self.p = subprocess.Popen(['node', os.path.join(HERE, 'render_server.cjs')], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        assert json.loads(self.p.stdout.readline())['ready']

    def __call__(self, **q):
        self.p.stdin.write(json.dumps(q) + '\n')
        return json.loads(self.p.stdout.readline())


# Two phrases, so a knob is not tuned to one way of playing: a scale up, one
# second a note, and sixteen half-second notes down the same octave.
UP = (0, 2, 4, 5, 7, 9, 11, 12)
DOWN = (12, 11, 9, 7, 5, 4, 2, 0, 12, 11, 9, 7, 5, 4, 2, 0)
PHRASES = [(UP, 1.0, 1.25), (DOWN, 0.5, 0.625)]


def comping(base, seed=0):
    """Organ music: four-note chords held through each bar under a melody in
    quarters, C Am F G twice (or F Dm Bb C)."""
    prog = [(0, 4, 7, 12), (-3, 0, 4, 9), (-7, -3, 0, 5), (-5, -1, 2, 7)] * 2
    if seed: prog = [tuple(n + 5 for n in ch) for ch in prog]
    tune = [16, 14, 12, 14, 16, 16, 16, 14, 12, 11, 9, 11, 12, 14, 16, 19] * 2
    beat = 0.6; notes = []
    for c, ch in enumerate(prog):
        t0 = 0.05 + c * 2 * beat
        for st in ch:
            notes.append({'note': base - st, 'at': t0, 'dur': 2 * beat - 0.04, 'vel': 80})
        for k in range(2):
            notes.append({'note': base - tune[(2 * c + k) % len(tune)] - (5 if seed else 0), 'at': t0 + k * beat, 'dur': beat - 0.05, 'vel': 95})
    return notes


def passage(base, seed=0):
    """Keyboard music rather than a scale: a left hand holding the root, a
    right hand in sixteenths up and down the chord, C Am F G twice. Rows count
    down from C8, so a semitone up is one row less."""
    chords = [(0, 4, 7), (9, 12, 16), (5, 9, 12), (7, 11, 14)] * 2
    beat = 0.6; notes = []
    for c, ch in enumerate(chords):
        t0 = 0.05 + c * 2 * beat
        notes.append({'note': base + 12 - ch[0], 'at': t0, 'dur': 2 * beat - 0.05, 'vel': 80})
        seq = [ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1], ch[0], ch[1]] if seed == 0 else [ch[2], ch[1], ch[0], ch[1], ch[2], ch[0] + 12, ch[2], ch[1]]
        for k, st in enumerate(seq):
            notes.append({'note': base - st, 'at': t0 + k * beat / 4, 'dur': beat / 4 - 0.01, 'vel': 90 - 10 * (k % 2)})
    return notes


def ref_embedding(spec):
    """None where no recording is at hand: then the label alone is the score."""
    if not spec.get('ref'):
        return None
    refs = []
    for k, (steps, held, step) in enumerate(PHRASES):
        path = os.path.join(C, f"_ref_{spec['name'].replace(' ', '_')}_{k}.wav")
        if not os.path.exists(path):
            sf.write(path, phrase(os.path.join(C, 'refs', spec['ref']), spec['ref_midi'], held, step, steps=steps), 48000)
        refs.append(listen(path))
    return refs


def score(spec, render, ref, params, tag='x', phrases=None):
    labs, ceils, sims, bads, peaks = [], [], [], [], []
    plans = [(comping if spec.get('keyboard') == 'chords' else passage)(spec['base'], k) for k in range(2)] if spec.get('keyboard') else [
        [{'note': spec['base'] - s, 'at': 0.05 + i * step, 'dur': held, 'vel': 96} for i, s in enumerate(steps)]
        for steps, held, step in PHRASES]
    for k, notes in enumerate(plans):
        if phrases is not None and k not in phrases:
            continue
        out = os.path.join(C, f'_tune_{tag}_{k}.wav')
        r = render(name=spec['name'], params=params, notes=notes, out=out)
        if not r['ok']:
            return -1.0, {'error': r['error']}
        s, e = listen(out)
        labs.append(max(s[l] for l in spec['labels']))
        ceils.append(max(ref[k][0][l] for l in spec['labels']) if ref else spec.get('ceil', 0.3))
        sims.append(float(e @ ref[k][1]) if ref else 1.0)
        bads.append(sum(s[l] for l in spec.get('avoid', [])))
        peaks.append(r['peak'])
    lab, ceil, sim, bad, peak = np.mean(labs), np.mean(ceils), np.mean(sims), np.mean(bads), max(peaks)
    pen = max(0.0, peak - 0.9) * 2 + max(0.0, 0.05 - peak) * 10
    total = min(lab / max(ceil, 1e-3), 1.5) + 2 * sim - 0.5 * bad - pen
    return float(total), {'label': round(float(lab), 3), 'ceil': round(float(ceil), 3), 'sim': round(float(sim), 3), 'avoid': round(float(bad), 3), 'peak': round(float(peak), 3)}


def run(spec, evals=120):
    render = Renderer()
    ref = ref_embedding(spec)
    keys = [k for k, *_ in spec['space']]
    lo = np.array([a for _, a, b, *_ in spec['space']], float)
    hi = np.array([b for _, a, b, *_ in spec['space']], float)
    logs = np.array([bool(r[3]) if len(r) > 3 else False for r in spec['space']])
    def to_params(u):
        u = np.clip(u, 0, 1)
        v = np.where(logs, lo * (hi / np.maximum(lo, 1e-9)) ** u, lo + (hi - lo) * u)
        # A key written a|b|c sets all of them: the players share one knob.
        return {kk: float(x) for k, x in zip(keys, v) for kk in k.split('|')}
    def from_params(p):
        v = np.array([p[k.split('|')[0]] for k in keys], float)
        return np.clip(np.where(logs, np.log(v / lo) / np.log(hi / lo), (v - lo) / (hi - lo)), 0, 1)
    x0 = from_params(spec['start'])
    base, info = score(spec, render, ref, to_params(x0), 'base', phrases=[0])
    print('start', round(base, 3), info, flush=True)
    best = (base, to_params(x0), info)
    es = cma.CMAEvolutionStrategy(x0, 0.25, {'bounds': [0, 1], 'maxfevals': evals, 'popsize': 8, 'verbose': -9, 'seed': 3})
    n = 0
    while not es.stop():
        xs = es.ask()
        fs = []
        for x in xs:
            f, info = score(spec, render, ref, to_params(x), phrases=[0])
            n += 1
            fs.append(-f)
            if f > best[0]:
                best = (f, to_params(x), info)
                print(f'{n:4d} best {f:.3f}', info, flush=True)
                # Kept as it is found, so a search stopped early loses nothing.
                json.dump({'score': best[0], 'params': best[1], 'info': best[2]}, open(os.path.join(C, f"tuned_{spec['name'].replace(' ', '_')}.json"), 'w'), indent=1)
        es.tell(xs, fs)
    json.dump({'score': best[0], 'params': best[1], 'info': best[2]}, open(os.path.join(C, f"tuned_{spec['name'].replace(' ', '_')}.json"), 'w'), indent=1)
    print('BEST', round(best[0], 3), best[2]); print(json.dumps(best[1], indent=1))
    render.p.stdin.close()


if __name__ == '__main__':
    from specs import SPECS
    name = sys.argv[1]
    evals = int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 120
    run(SPECS[name], evals)
