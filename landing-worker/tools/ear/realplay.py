"""Plays a note list on real recorded notes: the reference a render should be
heard against, on exactly the same music.

Notes are the engine's: {note: row (C8 is 0, so midi = 108 - row), at, dur, vel}.
A key's release lets the damper down: the recorded note fades over 0.12 s.
"""
import glob, os, re, numpy as np
from body import load

SR = 48000
NAMES = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def iowa_piano(dyn):
    """midi -> path for the Iowa MIS piano at one dynamic."""
    out = {}
    for f in glob.glob(os.path.join(os.path.dirname(__file__), f'.cache/refs/iowa-piano/Piano.{dyn}.*.wav')):
        m = re.search(r'\.([A-G]b?)(\d)\.wav$', f)
        if m: out[12 * (int(m.group(2)) + 1) + NAMES[m.group(1)]] = f
    return out


_cache = {}


def note_audio(path):
    if path not in _cache:
        x = load(path)
        on = np.argmax(np.abs(x) > 0.02 * np.abs(x).max())
        _cache[path] = x[max(0, on - 48):]
    return _cache[path]


def play(notes, seconds=10.3, banks=None, damper=0.12):
    banks = banks or {'mf': iowa_piano('mf'), 'ff': iowa_piano('ff')}
    out = np.zeros(int(seconds * SR))
    for n in notes:
        midi = 108 - n['note']
        bank = banks['ff'] if n.get('vel', 96) >= 110 else banks['mf']
        near = min(bank, key=lambda k: abs(k - midi))
        x = note_audio(bank[near])
        if near != midi:  # a missing key: shift the nearest by resampling
            r = 2 ** ((midi - near) / 12)
            x = np.interp(np.arange(0, len(x) - 1, r), np.arange(len(x)), x)
        hold = int(n['dur'] * SR); tail = int(damper * 5 * SR)
        x = x[:hold + tail].copy()
        if len(x) > hold:
            x[hold:] *= np.exp(-np.arange(len(x) - hold) / (damper * SR))
        g = (n.get('vel', 96) / 127) ** 1.5 / (np.abs(x).max() + 1e-9) * 0.3
        a = int(n['at'] * SR)
        seg = x[:max(0, len(out) - a)] * g
        out[a:a + len(seg)] += seg
    return out / (np.abs(out).max() + 1e-9) * 0.5
