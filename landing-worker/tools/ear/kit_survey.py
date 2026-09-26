"""Every key of a kit, eight hits in a row, as the ear hears it."""
import sys
from tune import Renderer
from ear import hear, top
KIT = sys.argv[1] if len(sys.argv) > 1 else 'JAZZ KIT'
TARGET = {35: 'Bass drum', 36: 'Bass drum', 37: 'Rimshot', 38: 'Snare drum', 39: 'Clapping', 40: 'Snare drum',
          41: 'Drum', 43: 'Drum', 45: 'Drum', 47: 'Drum', 48: 'Drum', 50: 'Drum',
          42: 'Hi-hat', 44: 'Hi-hat', 46: 'Hi-hat', 49: 'Cymbal', 51: 'Cymbal', 52: 'Cymbal', 55: 'Cymbal', 57: 'Cymbal', 59: 'Cymbal',
          53: 'Cymbal', 54: 'Tambourine', 56: 'Cowbell', 76: 'Wood block', 77: 'Wood block', 69: 'Maraca', 70: 'Maraca'}
skip = {'Music', 'Musical instrument', 'Percussion'}
r = Renderer()
for gm in (int(a) for a in sys.argv[2:]) if len(sys.argv) > 2 else TARGET:
    key = 108 - gm
    notes = [{'note': key, 'at': 0.05 + i * 0.5, 'dur': 0.2, 'vel': 100} for i in range(8)]
    res = r(kit=KIT, key=str(key), notes=notes, seconds=4.6, out='.cache/_kit.wav')
    if not res['ok']:
        print(gm, 'ERROR', res.get('error')); continue
    s = hear('.cache/_kit.wav', seconds=4.6)
    heard = ' | '.join(f'{k} {v:.2f}' for k, v in top(s, 8) if k not in skip)
    print(f'GM {gm:3d} {TARGET[gm]:11s} {s[TARGET[gm]]:.2f}   heard: {heard}', flush=True)
r.p.stdin.close()
