"""Write a tune_note.py result into the preset's literal in synth-presets.ts.

    uv run apply_note.py PRESET

Each moved knob `node.key` is set on the node's `['node', 'type', {...}]`
line inside the preset's block. A VCA's LVL is written back as its GAIN
percentage (the migration synth-presets.ts applies on load). Knobs that live
on nodes a composite expands to (an LFO's `_r`, `_k`) are not in the literal
and are reported, not guessed at.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '../../src/lib/stores/synth-presets.ts')


def fmt(v):
    return f'{float(f"{v:.4g}"):g}'


def main(name):
    moved = json.load(open(os.path.join(HERE, '.cache', f"tuned_note_{name.replace(' ', '_')}.json")))['moved']
    s = open(SRC).read()
    a = s.index(f"name: '{name}'")
    e = s.find("name: '", a + 8)
    e = len(s) if e < 0 else e
    blk = s[a:e]
    skipped = []
    for full, v in moved.items():
        nid, key = full.split('.', 1)
        m = re.search(r"\['" + re.escape(nid) + r"', '(\w+)'(?:, \{([^}]*)\})?\]", blk)
        if not m:
            skipped.append(full)
            continue
        typ, body = m.group(1), m.group(2)
        if typ == 'vca' and key == 'level':
            key, v = 'gain', v * 100
        pairs = [p.strip() for p in body.split(',')] if body else []
        pairs = [p for p in pairs if p and not p.startswith(key + ':')]
        pairs.append(f'{key}: {fmt(v)}')
        new = f"['{nid}', '{typ}', {{ {', '.join(pairs)} }}]"
        blk = blk[:m.start()] + new + blk[m.end():]
    open(SRC, 'w').write(s[:a] + blk + s[e:])
    print(f'{name}: {len(moved) - len(skipped)} knobs written', f'; not in the literal: {skipped}' if skipped else '')


if __name__ == '__main__':
    main(sys.argv[1])
