"""Tune one key of a kit against a recorded hit, with its knobs found for it.

    uv run tune_kit.py "JAZZ KIT" GM [--evals N]

Every numeric knob of the key's graph that is a quantity (a time, a level, a
frequency, a Q, a mix -- not a type, a choice or a drawn point) is searched
between a third and three times its value. The score is the hit's octave-band
decay against the recording (bands.py) plus what the ear hears in eight hits
against what it hears in the recording's eight. Writes .cache/kit_<KIT>_<GM>.json:
the knobs that moved, for drum-kits.ts's tuned table.
"""
import glob, json, os, re, sys, numpy as np, cma, soundfile as sf
from tune import Renderer
from bands import table
from body import load
from ear import listen
from kit_real import eight

C = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.cache')
V = os.path.join(C, 'refs', 'vcsl')
REFS = {  # GM -> (recording, label)
    38: ('Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v3_rr1_Mid.wav', 'Snare drum'),
    40: ('Membranophones/Struck Membranophones/Snare Drum, Modern 1/Snare2_HitSN_v3_rr1_Mid.wav', 'Snare drum'),
    39: ('Idiophones/Struck Idiophones/Claps/SoloClap_vl1.wav', 'Clapping'),
    56: ('Idiophones/Struck Idiophones/Cowbells/Cowbell1_Hit_v2_rr1_Mid.wav', 'Cowbell'),
    76: ('Idiophones/Struck Idiophones/Woodblock/wood_click2_mp.wav', 'Wood block'),
    77: ('Idiophones/Struck Idiophones/Woodblock/wood_click2_mp.wav', 'Wood block'),
    42: ('Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitC_v1_rr1_Mid.wav', 'Hi-hat'),
    46: ('Idiophones/Struck Idiophones/Hi-Hat Cymbal/HiHat_HitOC_rr5_Mid.wav', 'Hi-hat'),
}
DISCRETE = re.compile(r'^(type|kind|shape|shapeKind|group|bus|irBody|envCurve|inLo|inHi|drawN|d\d+|wave|lfoWave|cutGroup|solo|busy|dur|durSec|choke)$')
AVOID = ['Heart sounds, heartbeat', 'Heart murmur', 'Tick', 'Static', 'Sine wave', 'Beep, bleep', 'Ding', 'Drum machine', 'Synthesizer']


def main(kit, gm, evals):
    key = str(108 - gm)
    path, label = REFS[gm]
    real = load(os.path.join(V, path)); real = real[np.argmax(np.abs(real) > 0.05 * np.abs(real).max()):]
    real_tab = table(real)
    sf.write(os.path.join(C, '_kref.wav'), eight(os.path.join(V, path)), 48000)
    ref_s, ref_e = listen(os.path.join(C, '_kref.wav'), seconds=4.6)
    r = Renderer()
    info = r(kit=kit, key=key, getParams=True, notes=[], out='')
    base = {k: v for k, v in info['params'].items() if isinstance(v, (int, float)) and v > 0 and not DISCRETE.match(k.split('.', 1)[1])}
    names = sorted(base)
    print(f'GM {gm} {label}: {len(names)} knobs; recording hears {label} {ref_s[label]:.2f}', flush=True)
    lo = np.array([base[k] / 3 for k in names]); hi = np.array([base[k] * 3 for k in names])
    to = lambda u: {k: float(v) for k, v in zip(names, lo * (hi / lo) ** np.clip(u, 0, 1))}

    def loss(p):
        o1 = os.path.join(C, '_k1.wav'); o8 = os.path.join(C, '_k8.wav')
        a = r(kit=kit, key=key, params=p, notes=[{'note': int(key), 'at': 0.05, 'dur': 0.2, 'vel': 100}], seconds=3, out=o1)
        b = r(kit=kit, key=key, params=p, notes=[{'note': int(key), 'at': 0.05 + i * 0.5, 'dur': 0.2, 'vel': 100} for i in range(8)], seconds=4.6, out=o8)
        if not (a['ok'] and b['ok']):
            return 1e3, {}
        ours = table(load(o1))
        band = float(np.mean([abs(max(ours[t][i], -60) - max(real_tab[t][i], -60)) for t in real_tab for i in range(8)]))
        s, e = listen(o8, seconds=4.6)
        lab = s[label]; bad = sum(s[k] for k in AVOID if k in s)
        pen = max(0.0, b['peak'] - 0.95) * 10 + max(0.0, 0.03 - b['peak']) * 30
        return band - 6 * min(lab / max(ref_s[label], 0.05), 1.5) + 2 * bad - 4 * float(e @ ref_e) + pen, {'band': round(band, 2), 'label': round(lab, 3), 'avoid': round(bad, 3), 'sim': round(float(e @ ref_e), 3), 'peak': round(b['peak'], 3)}

    x0 = np.full(len(names), 0.5)
    f0, i0 = loss(to(x0)); best = (f0, to(x0), i0); print('start', round(f0, 2), i0, flush=True)
    es = cma.CMAEvolutionStrategy(x0, 0.2, {'bounds': [0, 1], 'maxfevals': evals, 'popsize': 8, 'verbose': -9, 'seed': 11})
    n = 0
    out = os.path.join(C, f"kit_{kit.replace(' ', '_')}_{gm}.json")
    while not es.stop():
        xs = es.ask(); fs = []
        for x in xs:
            f, inf = loss(to(x)); n += 1; fs.append(f)
            if f < best[0]:
                best = (f, to(x), inf); print(f'{n:4d} best {f:.2f}', inf, flush=True)
                moved = {k: round(v, 5) for k, v in best[1].items() if abs(np.log(v / base[k])) > 0.05}
                json.dump({'score': f, 'info': inf, 'moved': moved}, open(out, 'w'), indent=1)
        es.tell(xs, fs)
    print('BEST', round(best[0], 2), best[2]); r.p.stdin.close()


if __name__ == '__main__':
    main(sys.argv[1], int(sys.argv[2]), int(sys.argv[sys.argv.index('--evals') + 1]) if '--evals' in sys.argv else 80)
