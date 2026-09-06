"""Generate src/lib/songs/take-five.ts from a General MIDI file of Dave
Brubeck's "Take Five" (format 0, 96 ppq, channels: 0 piano, 1 acoustic bass,
2 jazz guitar, 3 alto sax, 4 pad (empty, dropped), 9 drums, 10 secondary
bass/comp pulse).

    python3 scripts/gen-take-five.py ~/Downloads/Take-Five-2.mid

Timing. One tempo (180 BPM), one meter change: a 1-bar 4/4 count-in then
118 bars of 5/4. At 24 steps per beat (full resolution, no half time) that
is (4 + 118*5)*24 = 14256 steps. Half time (12 steps/beat) was tried first
but rounds the ride cymbal's syncopated hits -- e.g. tick 540, step 67.5 at
12/beat -- to the wrong step, breaking the tune's signature 3+2 feel; the
source file's own ticks are only clean at 24 steps/beat. So this is written
at full resolution instead, and MAX_GRID_STEPS in synth.ts was raised from
12288 to 16384 to fit it (119 bars of 5/4 = 14280 steps, rounded up).

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

SRC = sys.argv[1] if len(sys.argv) > 1 else '/Users/kurashizu/Downloads/Take-Five-2.mid'
OUT = 'src/lib/songs/take-five.ts'
CAP = 16384
PPQ = 96
STEPS_PER_BEAT = 24  # full resolution; file bpm 180 kept as-is
BPM = 180

def step_of(tick: float) -> float:
    return tick / PPQ * STEPS_PER_BEAT

# channel -> track id. Melody (sax) first, then chords/comp, drums, bass, extra.
TRACK_OF = {3: 0, 0: 1, 2: 2, 9: 3, 1: 4, 10: 5}

# GM drum note -> hold in steps (24 steps/beat). Congas (62-64) follow the tom's pitch-by-key idea.
DRUM_HOLD = {35: 12, 40: 12, 44: 4, 45: 16, 46: 16, 48: 16, 49: 80, 51: 20, 52: 60, 53: 20, 55: 60, 57: 80, 59: 20, 62: 12, 63: 12, 64: 12}

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
    if ch not in TRACK_OF:
        continue
    t = TRACK_OF[ch]
    ns.sort()
    vels = sorted(v for *_, v in ns)
    base = vels[len(vels) // 2]
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
            if idx in cell or len(cell) >= 8:
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

total = -(-last_end // 240) * 240
assert total <= CAP, total
print('last end', last_end, 'total steps', total, '=', total / 240, 'bars of 5/4')
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

KICK = hit(0.17, 0.04, osc1Waveform='triangle', osc1Gain=1, subOscGain=0.4, noiseGain=0.15, pitchEnvAmount=3,
           pitchAttack=0.001, pitchDecay=0.03, cutoff=5000, filterEnvAmount=-0.6, filterAttack=0.001, filterDecay=0.05, filterSustain=0)
SNARE = hit(0.16, 0.05, osc1Waveform='triangle', osc1Gain=0.7, osc2Waveform='sine', osc2Gain=0.4, osc2Semitone=7, noiseGain=0.85,
            pitchEnvAmount=1, pitchAttack=0.001, pitchDecay=0.02, cutoff=7500, resonance=0.5, keyTracking=0.5,
            filterEnvAmount=0.3, filterAttack=0.001, filterDecay=0.08, filterSustain=0, airGain=0.15)
CHAT = hit(0.045, 0.02, osc1Waveform='noise', osc1Gain=1, filterType='highpass', cutoff=7000, resonance=0.5, keyTracking=0.8, airGain=0.4)
OHAT = hit(0.3, 0.12, osc1Waveform='noise', osc1Gain=1, filterType='highpass', cutoff=7000, resonance=0.5, keyTracking=0.8, airGain=0.4)
RIDE = hit(0.8, 0.35, osc1Waveform='metal', osc1Gain=1.0, noiseGain=0.4, keyTracking=0,
           filterType='highpass', cutoff=3800, resonance=0.9, airGain=0.4)
CRASH = hit(2.6, 1.0, osc1Waveform='metal', osc1Gain=0.55, noiseGain=0.9, keyTracking=0,
            filterType='highpass', cutoff=3500, resonance=0.5, airGain=0.5)
CHINA = hit(1.6, 0.7, osc1Waveform='metal', osc1Gain=0.6, noiseGain=0.8, keyTracking=0,
            filterType='highpass', cutoff=4200, resonance=0.6, airGain=0.5)
TOM = hit(0.35, 0.08, osc1Waveform='sine', osc1Gain=1, osc2Waveform='triangle', osc2Gain=0.3, subOscGain=0.3, noiseGain=0.12,
          pitchEnvAmount=1.2, pitchAttack=0.001, pitchDecay=0.08, cutoff=2500)
# Congas: a tom body with a tighter, more resonant filter for the slap.
CONGA = hit(0.22, 0.1, osc1Waveform='sine', osc1Gain=1, osc2Waveform='triangle', osc2Gain=0.35, noiseGain=0.2,
            pitchEnvAmount=0.8, pitchAttack=0.001, pitchDecay=0.05, cutoff=3200, resonance=1.2, filterEnvAmount=0.3, filterDecay=0.06, filterSustain=0)

KIT_GM = {
    35: KICK, 40: SNARE, 44: CHAT, 45: TOM, 46: OHAT, 48: TOM,
    49: CRASH, 51: RIDE, 52: CHINA, 53: RIDE, 55: CRASH, 57: CRASH, 59: RIDE,
    62: CONGA, 63: CONGA, 64: CONGA,
}
used_drums = sorted({n for _, _, n, _ in notes[9]})
KEY_TIMBRES = {108 - n: KIT_GM[n] for n in used_drums if n in KIT_GM}

TRACKS = [
    # A bandpass at a fixed-ish center (keyTracking 0.6) scooped out the
    # fundamental on some notes and the presence on others -- thin and
    # buried under the piano/guitar/ride. Lowpass with full key tracking
    # keeps the filter locked to the note's own harmonics as the melody
    # moves, and a higher cutoff + airGain give it the reed's bite instead
    # of relying on a narrow resonant peak to carve out its space.
    dict(id=0, name='TRK 1: ALTO SAX', color='#e5c07b', volume=1.3, pan=0.15,
         timbre=synth(osc1Waveform='sawtooth', osc1Gain=0.9, osc2Waveform='sawtooth', osc2Gain=0.6, osc2Semitone=0, detuneCents=8,
                      filterType='lowpass', cutoff=3200, resonance=1.4, keyTracking=1.0, envFilterMod=0,
                      filterAttack=0.015, filterDecay=0.2, filterSustain=0.8, filterEnvAmount=0.4,
                      noiseGain=0.08, ampAttack=0.015, ampDecay=0.1, ampSustain=0.9, ampRelease=0.12,
                      lfoRate=5.2, lfoPitchAmt=0.015, lfoFadeTime=200, airGain=0.3),
         # the drums here are a near-continuous ride ostinato, not sparse hits;
         # ducking the melody off every one of them (Spain's trick for a solo
         # popping over a sparse kit) would just flatten it, so it doesn't duck
         duck=dict(duckSource=-1, duckKeys=[], duckDepth=0)),
    dict(id=1, name='TRK 2: PIANO', color='#56b6c2', volume=0.65, pan=-0.2,
         timbre=synth(osc1Waveform='sine', osc1Gain=1, osc2Waveform='sine', osc2Gain=0.5, osc2Ratio=4, blendMode='fm', morphAmount=0.2,
                      cutoff=6000, resonance=0.3, filterEnvAmount=0.3, filterDecay=0.4, filterSustain=0.2,
                      ampAttack=0.002, ampDecay=0.6, ampSustain=0.35, ampRelease=0.3),
         duck=dict(duckSource=3, duckKeys=[108 - 40], duckDepth=0.2, duckDip=3, duckHold=30, duckRelease=90)),
    dict(id=2, name='TRK 3: JAZZ GUITAR', color='#98c379', volume=0.7, pan=0.25,
         timbre=synth(osc1Waveform='triangle', osc1Gain=1, osc2Waveform='sine', osc2Gain=0.4, osc2Ratio=2,
                      cutoff=3200, resonance=1, keyTracking=0.5, filterEnvAmount=0.5, filterAttack=0, filterDecay=0.1, filterSustain=0,
                      ampAttack=0.002, ampDecay=0.45, ampSustain=0.2, ampRelease=0.25),
         duck=dict(duckSource=3, duckKeys=[108 - 40], duckDepth=0.15, duckDip=3, duckHold=25, duckRelease=90)),
    dict(id=3, name='TRK 4: DRUMS', color='#d8dee9', volume=1.3, pan=0.0,
         timbre=RIDE, percussion=True,
         duck=dict(duckSource=-1, duckKeys=[], duckDepth=0)),
    dict(id=4, name='TRK 5: ACOUSTIC BASS', color='#61afef', volume=0.95, pan=0.0,
         timbre=synth(osc1Waveform='triangle', osc1Gain=1, osc2Waveform='sine', osc2Gain=0.5, subOscGain=0.35,
                      cutoff=1400, resonance=0.4, filterEnvAmount=0.25, filterDecay=0.12, filterSustain=0.2,
                      ampAttack=0.004, ampDecay=0.25, ampSustain=0.8, ampRelease=0.12),
         duck=dict(duckSource=3, duckKeys=[108 - 35], duckDepth=0.4, duckDip=3, duckHold=30, duckRelease=90)),
    dict(id=5, name='TRK 6: BASS PULSE', color='#c678dd', volume=0.35, pan=0.0,
         timbre=synth(osc1Waveform='triangle', osc1Gain=0.8, osc2Waveform='sine', osc2Gain=0.4, subOscGain=0.2,
                      cutoff=900, resonance=0.3, ampAttack=0.001, ampDecay=0.06, ampSustain=0.1, ampRelease=0.04),
         duck=dict(duckSource=3, duckKeys=[108 - 35], duckDepth=0.5, duckDip=2, duckHold=20, duckRelease=60)),
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
    for b in range(total // 240):
        out.append(f'  // BAR {b+1}')
        out.append('  ' + ', '.join('[' + ', '.join(map(str, c)) + ']' for c in grid[b*240:(b+1)*240]) + ',')
    out.append('];')
    return '\n'.join(out)

def acc_const(name, acc):
    out = [f'const {name}: number[] = [']
    for b in range(total // 240):
        out.append('  ' + ', '.join(map(str, acc[b*240:(b+1)*240])) + ',')
    out.append('];')
    return '\n'.join(out)

lines = ["import type { TrackData } from '../synth';",
         '',
         '/* Dave Brubeck Quartet, "Take Five" (1959), from a General MIDI',
         ' * transcription; generated by scripts/gen-take-five.py. Written in half',
         ' * time at 90 BPM: one sequencer beat is two of the tune\'s (the original',
         ' * runs at 180), so the famous 5/4 groove keeps its feel while fitting the',
         ' * step budget -- a sequencer bar (still labelled 5/4) spans two real bars.',
         f' * {total // 240} bars on the 1/24-beat grid. */',
         f'export const TAKE_FIVE_STEPS = {total};',
         '']
for t in TRACKS:
    lines.append(grid_const(f'TAKE_FIVE_TRK{t["id"]+1}_GRID', grids[t['id']]))
    lines.append(acc_const(f'TAKE_FIVE_TRK{t["id"]+1}_ACCENTS', accents[t['id']]))
    lines.append('')

lines.append('/* The kit, keyed by note index: ' + ', '.join(f'{108-n} = GM {n}' for n in used_drums if n in KIT_GM) + ' */')
lines.append('const TAKE_FIVE_KIT: Record<number, Partial<TrackData>> = {')
for k in sorted(KEY_TIMBRES):
    lines.append(f'  {k}: {ts(KEY_TIMBRES[k])},')
lines.append('};')
lines.append('')
lines.append('export const TAKE_FIVE_TRACKS: TrackData[] = [')
for t in TRACKS:
    body = dict(id=t['id'], name=t['name'], color=t['color'], volume=t['volume'], pan=t['pan'], muted=False, solo=False)
    body.update(t['timbre'])
    body.update(t['duck'])
    fields = ',\n    '.join(f'{k}: {ts(v)}' for k, v in body.items())
    extra = ''
    if t.get('percussion'):
        extra = ',\n    percussion: true,\n    keyTimbres: TAKE_FIVE_KIT'
    lines.append('  {\n    ' + fields + extra + f',\n    grid: TAKE_FIVE_TRK{t["id"]+1}_GRID,\n    accents: TAKE_FIVE_TRK{t["id"]+1}_ACCENTS,\n  }},')
lines.append('];')
open(OUT, 'w').write('\n'.join(lines) + '\n')
print('wrote', OUT)
