"""Generate src/lib/songs/spain.ts from a General MIDI file of Chick Corea's
"Spain" (format 0, 96 ppq, channels: 0 piano, 1 acoustic bass, 3 flute,
4 synth brass, 5 nylon guitar, 9 drums).

    python3 scripts/gen-spain.py ~/Downloads/SPAIN-1.MID

Timing. The file has three tempos: a 4-beat empty lead-in at 120, the
Concierto de Aranjuez intro at 78, and the body at 230. The sequencer has one
tempo and grids of 12288 steps, and the file is 872 beats -- 20928 steps at
24 per beat. So the song is written in half time at 115 BPM: one MIDI beat
of the body is 12 steps (exactly 230), and one intro beat is 36 steps
(76.7 BPM, 1.7 % under the file's 78). That fits in 12192 steps = 127 bars.

Notes. A run of the same index on consecutive steps is one held note, so a
note that starts where the previous one of the same pitch ends is separated
by a one-step gap or the two would merge. Drums get fixed hold lengths per
sound. Velocity becomes an accent only where it stands out from the track's
own median, as the MIDI importer does.
"""
import sys
import json
from collections import defaultdict

import mido

SRC = sys.argv[1] if len(sys.argv) > 1 else '/Users/kurashizu/Downloads/SPAIN-1.MID'
OUT = 'src/lib/songs/spain.ts'
CAP = 12288
PPQ = 96
LEADIN = 4 * PPQ          # empty
INTRO_END = 84 * PPQ      # tempo flips to 230 here
INTRO_STEPS = 36          # per MIDI beat
BODY_STEPS = 12
POLY = 8

def step_of(tick: float) -> float:
    if tick <= LEADIN:
        return 0.0
    if tick <= INTRO_END:
        return (tick - LEADIN) / PPQ * INTRO_STEPS
    return (INTRO_END - LEADIN) / PPQ * INTRO_STEPS + (tick - INTRO_END) / PPQ * BODY_STEPS

# channel -> track id
TRACK_OF = {3: 0, 0: 1, 5: 2, 9: 3, 1: 4, 4: 5}

# GM drum note -> hold in steps. A tom's pitch follows its key.
DRUM_HOLD = {35: 6, 36: 6, 38: 6, 40: 6, 42: 2, 44: 2, 46: 8, 51: 8, 49: 24, 56: 5, 43: 8, 47: 8, 50: 8}

def note_index(midi: int):
    idx = 108 - midi
    return idx if 0 <= idx < 88 else None

mid = mido.MidiFile(SRC)
assert mid.ticks_per_beat == PPQ
tick = 0
open_notes = {}
notes = defaultdict(list)   # channel -> [(startTick, endTick, midi, vel)]
for msg in mid.tracks[0]:
    tick += msg.time
    if msg.type == 'note_on' and msg.velocity > 0:
        open_notes[(msg.channel, msg.note)] = (tick, msg.velocity)
    elif msg.type in ('note_off', 'note_on'):
        k = (msg.channel, msg.note)
        if k in open_notes:
            s, v = open_notes.pop(k)
            notes[msg.channel].append((s, tick, msg.note, v))

grids = {t: [[] for _ in range(CAP)] for t in TRACK_OF.values()}
accents = {t: [0] * CAP for t in TRACK_OF.values()}
stats = {}
last_end = 0

for ch, ns in notes.items():
    t = TRACK_OF[ch]
    ns.sort()
    vels = sorted(v for *_, v in ns)
    base = vels[len(vels) // 2]
    # next start of the same pitch, to leave the retrigger gap
    nxt = {}
    by_pitch = defaultdict(list)
    for i, (s, e, n, v) in enumerate(ns):
        by_pitch[n].append(i)
    for n, idxs in by_pitch.items():
        for a, b in zip(idxs, idxs[1:]):
            nxt[a] = ns[b][0]
    written = dropped = 0
    for i, (s, e, n, v) in enumerate(ns):
        idx = note_index(n)
        if idx is None:
            dropped += 1
            continue
        start = int(round(step_of(s)))
        if ch == 9:
            end = start + DRUM_HOLD.get(n, 4)
        else:
            end = max(start + 1, int(round(step_of(e))))
        if i in nxt:
            end = min(end, max(start + 1, int(round(step_of(nxt[i]))) - 1))
        end = min(end, CAP)
        if start >= CAP:
            dropped += 1
            continue
        ok = False
        for st in range(start, end):
            cell = grids[t][st]
            if idx in cell or len(cell) >= POLY:
                continue
            cell.append(idx)
            cell.sort()
            ok = True
        if not ok:
            dropped += 1
            continue
        written += 1
        last_end = max(last_end, end)
        over = v - base
        accents[t][start] = max(accents[t][start], 2 if over >= 32 else 1 if over >= 16 else 0)
    stats[t] = (ch, written, dropped, base)

total = -(-last_end // 96) * 96
assert total <= CAP, total
print('last end', last_end, 'total steps', total, '=', total // 96, 'bars')
for t in sorted(stats):
    ch, w, d, base = stats[t]
    print(f'  TRK {t+1} <- ch{ch}: {w} notes, {d} dropped, median vel {base}')

# ---------------- timbres ----------------

BASE = dict(
    osc1Waveform='square', osc1Gain=0.9, osc2Waveform='sawtooth', osc2Gain=0.5, osc2Ratio=1, detuneCents=0,
    phaseOffset=0, osc2Semitone=0, pulseWidth=50, subOscGain=0, noiseGain=0, noiseRetrig=1, noiseRetrigGap=12,
    blendMode='layer', morphAmount=0, glideTime=0, xfade=0.5,
    filterType='lowpass', cutoff=12000, resonance=0.2, envFilterMod=0, keyTracking=0,
    ampAttack=0.005, ampDecay=0.15, ampSustain=0.7, ampRelease=0.1,
    filterAttack=0.005, filterDecay=0.15, filterSustain=0.3, filterRelease=0.1, filterEnvAmount=0,
    pitchAttack=0.001, pitchDecay=0.03, pitchEnvAmount=0,
    lfoWaveform='sine', lfoRate=5, lfoPitchAmt=0, lfoCutoffAmt=0, lfoPanAmt=0, lfoAmpAmt=0, lfoFadeTime=0,
    eqOn=False, eqGains=[0, 0, 0, 0, 0, 0], airGain=0,
)

def synth(**extra):
    p = {**BASE, **extra}
    p['attack'] = p['ampAttack']; p['decay'] = p['ampDecay']; p['sustain'] = p['ampSustain']; p['release'] = p['ampRelease']
    return p

def hit(ampDecay, ampRelease, **extra):
    return synth(**{**dict(osc2Gain=0, ampAttack=0, ampDecay=ampDecay, ampSustain=0, ampRelease=ampRelease), **extra})

# The kit, keyed by note index (108 - GM note). Presets from the DRUMS
# category, with the ride, crash and pedal hat derived from the hats.
KICK = hit(0.17, 0.04, osc1Waveform='triangle', osc1Gain=1, subOscGain=0.4, noiseGain=0.15, pitchEnvAmount=3,
           pitchAttack=0.001, pitchDecay=0.03, cutoff=5000, filterEnvAmount=-0.6, filterAttack=0.001, filterDecay=0.05, filterSustain=0)
SNARE = hit(0.18, 0.05, osc1Waveform='triangle', osc1Gain=0.8, osc2Waveform='sine', osc2Gain=0.5, osc2Semitone=7, noiseGain=0.9,
            pitchEnvAmount=1, pitchAttack=0.001, pitchDecay=0.02, cutoff=8000, resonance=0.5, keyTracking=0.5,
            filterEnvAmount=0.3, filterAttack=0.001, filterDecay=0.08, filterSustain=0, airGain=0.2)
CHAT = hit(0.045, 0.02, osc1Waveform='noise', osc1Gain=1, filterType='highpass', cutoff=7000, resonance=0.5, keyTracking=0.8, airGain=0.4)
PHAT = hit(0.03, 0.02, osc1Waveform='noise', osc1Gain=1, filterType='highpass', cutoff=8000, resonance=0.5, keyTracking=0.8, airGain=0.2)
OHAT = hit(0.35, 0.15, osc1Waveform='noise', osc1Gain=1, filterType='highpass', cutoff=7000, resonance=0.5, keyTracking=0.8, airGain=0.4)
RIDE = hit(0.22, 0.12, osc1Waveform='noise', osc1Gain=0.8, osc2Waveform='square', osc2Gain=0.35, osc2Ratio=4, blendMode='ring',
           filterType='highpass', cutoff=5500, resonance=1.2, airGain=0.3)
CRASH = hit(0.9, 0.4, osc1Waveform='noise', osc1Gain=1, filterType='highpass', cutoff=5000, resonance=0.4, airGain=0.4)
TOM = hit(0.35, 0.08, osc1Waveform='sine', osc1Gain=1, osc2Waveform='triangle', osc2Gain=0.3, subOscGain=0.3, noiseGain=0.12,
          pitchEnvAmount=1.2, pitchAttack=0.001, pitchDecay=0.08, cutoff=2500)
COWBELL = hit(0.3, 0.1, osc1Waveform='square', osc1Gain=1, osc2Waveform='square', osc2Gain=1, osc2Ratio=1.5, filterType='bandpass', cutoff=1500, resonance=1)

KIT_GM = {35: KICK, 36: KICK, 38: SNARE, 40: SNARE, 42: CHAT, 44: PHAT, 46: OHAT, 51: RIDE, 49: CRASH, 56: COWBELL, 43: TOM, 47: TOM, 50: TOM}
used_drums = sorted({n for _, _, n, _ in notes[9]})
KEY_TIMBRES = {108 - n: KIT_GM[n] for n in used_drums if n in KIT_GM}

TRACKS = [
    dict(id=0, name='TRK 1: FLUTE', color='#e5c07b', volume=0.9, pan=0.12,
         timbre=synth(osc1Waveform='sine', osc1Gain=1, osc2Waveform='triangle', osc2Gain=0.35, noiseGain=0.05,
                      cutoff=5200, resonance=0.4, ampAttack=0.03, ampDecay=0.2, ampSustain=0.85, ampRelease=0.12,
                      filterAttack=0.03, filterDecay=0.2, filterSustain=0.6, filterEnvAmount=0.15,
                      lfoRate=5.5, lfoPitchAmt=0.02, lfoFadeTime=180, airGain=0.1),
         duck=dict(duckSource=-1, duckKeys=[], duckDepth=0)),
    dict(id=1, name='TRK 2: PIANO', color='#56b6c2', volume=0.6, pan=-0.2,
         timbre=synth(osc1Waveform='sine', osc1Gain=1, osc2Waveform='sine', osc2Gain=0.5, osc2Ratio=4, blendMode='fm', morphAmount=0.2,
                      cutoff=6000, resonance=0.3, filterEnvAmount=0.3, filterDecay=0.4, filterSustain=0.2,
                      ampAttack=0.002, ampDecay=0.6, ampSustain=0.35, ampRelease=0.3),
         # the comping steps back for the snare so the backbeat reads
         duck=dict(duckSource=3, duckKeys=[108 - 40], duckDepth=0.2, duckDip=3, duckHold=30, duckRelease=90)),
    dict(id=2, name='TRK 3: NYLON GUITAR', color='#98c379', volume=0.75, pan=0.25,
         timbre=synth(osc1Waveform='triangle', osc1Gain=1, osc2Waveform='sine', osc2Gain=0.4, osc2Ratio=2,
                      cutoff=4000, resonance=1, keyTracking=0.5, filterEnvAmount=0.6, filterAttack=0, filterDecay=0.08, filterSustain=0,
                      ampAttack=0.002, ampDecay=0.5, ampSustain=0.25, ampRelease=0.3),
         duck=dict(duckSource=-1, duckKeys=[], duckDepth=0)),
    dict(id=3, name='TRK 4: DRUMS', color='#d8dee9', volume=1.4, pan=0.0,
         timbre=CHAT, percussion=True,
         duck=dict(duckSource=-1, duckKeys=[], duckDepth=0)),
    dict(id=4, name='TRK 5: ACOUSTIC BASS', color='#61afef', volume=0.95, pan=0.0,
         timbre=synth(osc1Waveform='triangle', osc1Gain=1, osc2Waveform='sine', osc2Gain=0.5, subOscGain=0.35,
                      cutoff=1400, resonance=0.4, filterEnvAmount=0.25, filterDecay=0.12, filterSustain=0.2,
                      ampAttack=0.004, ampDecay=0.25, ampSustain=0.8, ampRelease=0.12),
         # the bass makes room for the kick; both live in the low end
         duck=dict(duckSource=3, duckKeys=[108 - 35], duckDepth=0.45, duckDip=3, duckHold=30, duckRelease=90)),
    dict(id=5, name='TRK 6: SYNTH BRASS', color='#c678dd', volume=0.8, pan=-0.1,
         timbre=synth(osc1Waveform='sawtooth', osc2Waveform='sawtooth', detuneCents=12, cutoff=2400, resonance=2.0,
                      ampAttack=0.03, ampDecay=0.15, ampSustain=0.8, ampRelease=0.05,
                      filterAttack=0.05, filterDecay=0.15, filterSustain=0.5, filterRelease=0.05, filterEnvAmount=0.55),
         # the solo sits on top of the kit: every hit gets its instant
         duck=dict(duckSource=3, duckKeys=[], duckDepth=0.25, duckDip=3, duckHold=25, duckRelease=80)),
]

# ---------------- emit ----------------

def ts(v):
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, str):
        return f"'{v}'"
    if isinstance(v, (list, tuple)):
        return '[' + ', '.join(ts(x) for x in v) + ']'
    if isinstance(v, dict):
        return '{ ' + ', '.join(f'{k}: {ts(x)}' for k, x in v.items()) + ' }'
    return json.dumps(v)

def grid_const(name, grid):
    out = [f'const {name}: number[][] = [']
    for b in range(total // 96):
        out.append(f'  // BAR {b+1}')
        out.append('  ' + ', '.join('[' + ', '.join(map(str, c)) + ']' for c in grid[b*96:(b+1)*96]) + ',')
    out.append('];')
    return '\n'.join(out)

def acc_const(name, acc):
    out = [f'const {name}: number[] = [']
    for b in range(total // 96):
        out.append('  ' + ', '.join(map(str, acc[b*96:(b+1)*96])) + ',')
    out.append('];')
    return '\n'.join(out)

lines = ["import type { TrackData } from '../synth';",
         '',
         '/* Chick Corea, "Spain" (1972), from a General MIDI transcription; generated by',
         ' * scripts/gen-spain.py. Written in half time at 115 BPM: one sequencer beat is',
         ' * two of the tune\'s (the body runs at 230), and the rubato intro is stretched',
         ' * three-fold so one tempo carries both. 127 bars on the 1/24-beat grid. */',
         f'export const SPAIN_STEPS = {total};',
         '']
for t in TRACKS:
    lines.append(grid_const(f'SPAIN_TRK{t["id"]+1}_GRID', grids[t['id']]))
    lines.append(acc_const(f'SPAIN_TRK{t["id"]+1}_ACCENTS', accents[t['id']]))
    lines.append('')

lines.append('/* The kit, keyed by note index: ' + ', '.join(f'{108-n} = GM {n}' for n in used_drums if n in KIT_GM) + ' */')
lines.append('const SPAIN_KIT: Record<number, Partial<TrackData>> = {')
for k in sorted(KEY_TIMBRES):
    lines.append(f'  {k}: {ts(KEY_TIMBRES[k])},')
lines.append('};')
lines.append('')
lines.append('export const SPAIN_TRACKS: TrackData[] = [')
for t in TRACKS:
    body = dict(id=t['id'], name=t['name'], color=t['color'], volume=t['volume'], pan=t['pan'], muted=False, solo=False)
    body.update(t['timbre'])
    body.update(t['duck'])
    fields = ',\n    '.join(f'{k}: {ts(v)}' for k, v in body.items())
    extra = ''
    if t.get('percussion'):
        extra = ',\n    percussion: true,\n    keyTimbres: SPAIN_KIT'
    lines.append('  {\n    ' + fields + extra + f',\n    grid: SPAIN_TRK{t["id"]+1}_GRID,\n    accents: SPAIN_TRK{t["id"]+1}_ACCENTS,\n  }},')
lines.append('];')
open(OUT, 'w').write('\n'.join(lines) + '\n')
print('wrote', OUT)
