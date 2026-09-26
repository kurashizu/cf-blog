"""Every render in .cache/renders against its target: the target's score and what is heard instead."""
import os, sys
from ear import hear, top
from targets import TARGETS
R = os.path.join(os.path.dirname(__file__), '.cache/renders')
skip = {'Music', 'Musical instrument'}
names = sys.argv[1:] or list(TARGETS)
for name in names:
    f = os.path.join(R, ''.join(c if c.isalnum() else '_' for c in name) + '.wav')
    if not os.path.exists(f): continue
    s = hear(f)
    want = TARGETS[name]
    best = max(want, key=lambda k: s[k])
    heard = [(k, v) for k, v in top(s, 10) if k not in skip][:4]
    print(f'{name:14s} {best[:18]:18s} {s[best]:.2f}   heard: ' + ' | '.join(f'{k} {v:.2f}' for k, v in heard))
