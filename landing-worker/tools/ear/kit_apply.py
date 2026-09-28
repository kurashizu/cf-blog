"""Write tuned kit keys (.cache/kit_<KIT>_<GM>.json) into drum-kits.ts's
JAZZ_TUNED, each key's TRIM set so its peak is what its builder gave it
(0.9 at most): the tuner's score cannot hear loudness against the others.

    uv run kit_apply.py GM [GM ...]
"""
import json, os, re, sys, time
from tune import Renderer
HERE = os.path.dirname(os.path.abspath(__file__)); C = os.path.join(HERE, '.cache')
SRC = os.path.join(HERE, '../../src/lib/stores/drum-kits.ts')


def table_span(s):
    a = s.index('const JAZZ_TUNED: Record<number, Record<string, number>> = {'); b = s.index('\n};\n', a) + 3
    return a, b


def set_entries(s, entries, drop):
    """JAZZ_TUNED with the `drop` keys' entries taken out and `entries` added."""
    a, b = table_span(s); blk = s[a:b]
    for g in drop:
        blk = re.sub(r',?\n\t' + str(g) + r': \{[^}]*\}', '', blk)
    body = blk[blk.index('{') + 1: blk.rindex('}')].strip().rstrip(',')
    rows = [body] if body else []
    for g, knobs in entries.items():
        rows.append(f'\t{g}: {{ ' + ', '.join(f"'{k}': {float(f'{v:.4g}'):g}" for k, v in sorted(knobs.items())) + ' }')
    new = 'const JAZZ_TUNED: Record<number, Record<string, number>> = {\n' + ',\n'.join(r.strip('\n') if i else r for i, r in enumerate(rows)) + '\n};\n'
    return s[:a] + new + s[b:]


def clear_entry(gm):
    """The key back on its builder's numbers, for a tuner to start from."""
    s = open(SRC).read()
    open(SRC, 'w').write(set_entries(s, {}, [gm]))


def settled(r, want):
    """Wait for the dev server to serve the file just written: rendering
    before HMR has swapped it measures the old key, and a trim set from that
    left three keys clipping."""
    for _ in range(60):
        ok = True
        for g, knobs in want.items():
            got = r(kit='JAZZ KIT', key=str(108 - g), getParams=True, notes=[], out='')['params']
            ok &= all(abs(got.get(k, float('nan')) - float(f'{v:.4g}')) <= 1e-6 * max(1, abs(v)) for k, v in knobs.items())
        if ok:
            return
        time.sleep(1)
    raise RuntimeError('the dev server never served the new table')


def peaks(r, gms):
    out = {}
    for g in gms:
        k = 108 - g
        x = r(kit='JAZZ KIT', key=str(k), notes=[{'note': k, 'at': 0.05, 'dur': 0.2, 'vel': 100}], seconds=2, out=os.path.join(C, '_p.wav'))
        info = r(kit='JAZZ KIT', key=str(k), getParams=True, notes=[], out='')
        out[g] = (x['peak'], info['params'].get('trim.level', 1))
    return out


def main(gms):
    orig = open(SRC).read()
    moved = {g: {k: v for k, v in json.load(open(os.path.join(C, f'kit_JAZZ_KIT_{g}.json')))['moved'].items() if k != 'trim.level'} for g in gms}
    r = Renderer()
    open(SRC, 'w').write(set_entries(orig, {}, gms)); time.sleep(4); p0 = peaks(r, gms)
    open(SRC, 'w').write(set_entries(orig, moved, gms)); settled(r, moved); p1 = peaks(r, gms)
    final = {g: {**moved[g], 'trim.level': min(2.0, p0[g][1] * min(p0[g][0], 0.9) / max(p1[g][0], 1e-4))} for g in gms}
    open(SRC, 'w').write(set_entries(orig, final, gms)); settled(r, final); p2 = peaks(r, gms)
    for g in gms: print(g, 'builder peak', round(p0[g][0], 3), '-> tuned', round(p1[g][0], 3), '-> trimmed', round(p2[g][0], 3))
    r.p.stdin.close()


if __name__ == '__main__':
    main([int(a) for a in sys.argv[1:]])
