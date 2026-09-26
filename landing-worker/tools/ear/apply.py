"""Write a tuned result (.cache/tuned_NAME.json) back into the preset's source:
each `id.key` is the `key:` inside that preset's `['id', type, {...}]` tuple.

    uv run apply.py NAME [decimals]
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '../../src/lib/stores/synth-presets.ts')
name = sys.argv[1]
dec = int(sys.argv[2]) if len(sys.argv) > 2 else 4
tuned = json.load(open(os.path.join(HERE, '.cache', f"tuned_{name.replace(' ', '_')}.json")))['params']
s = open(SRC).read()
a = s.index(f"name: '{name}'")
b = s.find("\n\t{\n", a); b = len(s) if b < 0 else b
block = s[a:b]
for k, v in tuned.items():
    nid, key = k.split('.')
    pat = re.compile(r"(\['" + re.escape(nid) + r"', '[a-z0-9]+', \{[^}]*?\b" + re.escape(key) + r": )(-?[0-9.e]+)")
    val = f'{round(v, dec):g}' if abs(v) >= 1 or v == 0 else f'{float(f"{v:.{dec}g}"):g}'
    block, n = pat.subn(lambda m: m.group(1) + val, block, count=1)
    print(('set ' if n else 'MISSING ') + k, val)
s = s[:a] + block + s[b:]
open(SRC, 'w').write(s)
