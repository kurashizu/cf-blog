"""Which distance predicts what the listener heard? The blind trials
(listen.py) are the ground truth: for each pair, did they pick the real
one. A measure is worth voicing with in proportion to how well its distance
between the pair ranks the trials they caught above the ones they did not
(AUC: 0.5 is chance, 1 a perfect predictor).

    uv run calib.py
"""
import json, os, numpy as np
from body import load
from validate import features
from kitdiag import table

HERE = os.path.dirname(os.path.abspath(__file__))
L = os.path.join(HERE, '.cache', 'listen')


def sones(T):
    """Band levels as loudness: a band 40 dB under the loudest is nearly
    nothing to the ear (loudness grows as intensity^0.3, ~10 dB a doubling)."""
    return 10 ** (np.maximum(T, -80) * 0.03)


def auc(scores, caught):
    pos = [s for s, c in zip(scores, caught) if c]
    neg = [s for s, c in zip(scores, caught) if not c]
    if not pos or not neg:
        return float('nan')
    return float(np.mean([(p > n) + 0.5 * (p == n) for p in pos for n in neg]))


def main():
    truth = json.load(open(os.path.join(L, 'truth.json')))
    ans = {json.loads(l)['id']: json.loads(l)['choice'] for l in open(os.path.join(L, 'answers.jsonl'))}
    rows = []
    for tid, t in sorted(truth.items()):
        if tid not in ans:
            continue
        real = load(os.path.join(L, f"{tid}{t['real']}.wav"))
        ours = load(os.path.join(L, f"{tid}{'B' if t['real'] == 'A' else 'A'}.wav"))
        fr, fo = features(real), features(ours)
        Tr, To = table(real), table(ours)
        rows.append({
            'item': t['item'], 'caught': ans[tid] == t['real'],
            'ast': 1 - float(fr[1] @ fo[1]),
            'band dB': float(np.mean(np.abs(np.maximum(Tr, -60) - np.maximum(To, -60)))),
            'band loudness': float(np.mean(np.abs(sones(Tr) - sones(To)))),
            'band loudness, first 0.2 s': float(np.mean(np.abs(sones(Tr[:5]) - sones(To[:5])))),
            'spectrum (0-0.5 s)': float(np.mean(np.abs(sones(Tr[:6]).mean(0) - sones(To[:6]).mean(0)))),
        })
    caught = [r['caught'] for r in rows]
    print(f'{len(rows)} trials, {sum(caught)} caught')
    for k in [k for k in rows[0] if k not in ('item', 'caught')]:
        print(f'  {k:28s} AUC {auc([r[k] for r in rows], caught):.2f}')
    print(f"\n{'':22s} {'caught':>7s} {'ast':>6s}")
    items = sorted({r['item'] for r in rows}, key=lambda i: -np.mean([r['ast'] for r in rows if r['item'] == i]))
    for i in items:
        mine = [r for r in rows if r['item'] == i]
        print(f"{i:22s} {sum(r['caught'] for r in mine)}/{len(mine):<5d} {np.mean([r['ast'] for r in mine]):6.3f}")


if __name__ == '__main__':
    main()
