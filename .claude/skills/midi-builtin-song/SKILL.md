---
name: midi-builtin-song
description: Turn a .mid file into a built-in song of the krsz.in synth (landing-worker). Use when asked to add a MIDI file as a built-in / preset song, re-generate an existing song file, or fix its arrangement.
---

# Import a MIDI file as a built-in song

Goal: `some.mid` → `landing-worker/src/lib/songs/<song>.ts` → appears in the synth's LOAD ▼ list and plays with sensible sounds.

Work in `landing-worker/`. Template to copy: `scripts/gen-spain.py` (reads the MIDI with `mido`, writes the .ts). Do **not** commit the .mid file; write its original path in the script's docstring.

## 1. Look at the file first

```bash
cd landing-worker
uv run --with mido python3 - <<'EOF'
import mido, sys
m = mido.MidiFile('/path/to/song.mid')
print('ppq', m.ticks_per_beat, 'tracks', len(m.tracks), 'length s', round(m.length, 1))
for i, tr in enumerate(m.tracks):
    chans, progs, tempos, names, notes = set(), {}, [], [], {}
    for msg in tr:
        if msg.type == 'program_change': progs[msg.channel] = msg.program
        if msg.type == 'set_tempo': tempos.append(round(mido.tempo2bpm(msg.tempo)))
        if msg.type == 'track_name': names.append(msg.name)
        if msg.type == 'note_on' and msg.velocity: chans.add(msg.channel); notes[msg.channel] = notes.get(msg.channel, 0) + 1
    print(i, names, 'ch', sorted(chans), 'program', progs, 'tempo', tempos[:6], 'notes', notes)
EOF
```

Write down, per channel: GM program number, note count, pitch range, and whether it is channel 9 (drums). Note every tempo change.

## 2. Decide the grid

The sequencer has **one tempo**, **24 steps per beat**, bar = beats-per-bar × 24 steps (4/4 → 96), **max 12288 steps** (128 bars of 4/4). Note index = `108 − MIDI note` (C4 = 48; only 0..87 fit, drop the rest). Up to **8 notes per cell**, **8 tracks**.

- Constant tempo, song fits: steps per MIDI beat = 24, bpm = the file's.
- Too long (more than 12288 steps at 24 per beat): write it in **half time**: 12 steps per MIDI beat, bpm = file bpm ÷ 2, **meter unchanged**. The song plays at the same speed with half the steps; one sequencer bar now holds two real bars. This works for any meter, because it halves the steps per beat, not the bar: 5/4 at 180 → sequencer 5/4 at 90, a real 5/4 bar is 60 steps, a sequencer bar (120 steps) is two real bars. Spain does this: 230 BPM body → 115 BPM, 12 steps per MIDI beat. 12 steps per beat still resolves 16ths (3 steps) and triplets (4 steps).
- Tempo changes: pick steps-per-MIDI-beat per section so one bpm carries all of them (Spain: intro 36 steps/beat, body 12). Small errors (a few %) are fine.
- Round the total up to whole bars.

## 3. Map channels to tracks (max 8)

One MIDI channel → one track. Drop empty or duplicate channels. Order: melody first, then chords, guitar/keys, drums, bass, extra. Name tracks `TRK n: INSTRUMENT`. If the file has fewer than 8, the engine pads the rest (`padTracks`), do nothing.

## 4. Pick a sound per track — this is the part to think about

Match the GM program to a sound. First choice: a preset from `src/lib/stores/synth-presets.ts` (categories BASS, LEAD, PLUCK, KEYS, PAD, DRUMS; copy its fields). If none fits, build one from the recipes in `scripts/gen-spain.py` (`synth(...)` / `hit(...)`) and adjust. Listen and compare with the original recording if you know it.

| GM program | Use |
|---|---|
| 0–7 piano | Spain piano: sine + sine ×4 in FM (`blendMode='fm', morphAmount=0.2`), decay 0.6, sustain 0.35. Or preset E-PIANO |
| 8–15 mallets / bells | Presets BELL, MARIMBA |
| 16–23 organ | Preset ORGAN, or `osc1Waveform='organ'` with drawbars in `waveParams` (org1…org8) |
| 24–31 guitar | Nylon: triangle + sine ×2, resonant lowpass, fast filter envelope (Spain guitar). Distorted: saw + DRIVE in rack 6 |
| 32–39 bass | Acoustic: triangle + sine + `subOscGain` 0.35, cutoff 1400 (Spain bass). Synth: presets 8-BIT BASS, ACID BASS, FM BASS, SUB BASS |
| 40–55 strings / ensemble / choir | Presets STRINGS, WARM PAD, HOLLOW PAD; or `osc1Waveform='supersaw'` with slow attack |
| 56–63 brass | Two saws, `detuneCents` 12, cutoff 2400 with filter envelope, short release (Spain brass). Preset BRASS |
| 64–79 sax / flute / reeds | Flute: sine + triangle 0.35, `noiseGain` 0.05 breath, vibrato `lfoRate` 5.5 `lfoPitchAmt` 0.02 with `lfoFadeTime` (Spain flute). Sax: saw through bandpass |
| 80–87 synth lead | Presets SAW LEAD, CHIP LEAD, SYNC LEAD; `osc1Waveform='pwm'` for a moving lead |
| 88–103 synth pad / FX | PAD presets |
| 104–119 ethnic / percussive | KOTO, MARIMBA, or a `hit(...)` |
| channel 9 | Drums, see below |

Waves available: `square sawtooth triangle sine noise metal pwm supersaw organ fold` (`metal` = 808 cymbal bank, only sensible for cymbals; `pwm`/`supersaw`/`organ`/`fold` take knobs in `waveParams`, see `WAVE_PARAM_SPECS` in `src/lib/synth.ts`).

**Drums**: one track with `percussion: true` and `keyTimbres` keyed by note index (`108 − GM note`). Recipes in `gen-spain.py`: KICK (35, 36), SNARE (38, 40), CHAT (42), PHAT (44), OHAT (46), RIDE (51, 59), CRASH (49, 57), TOM (41–50, pitch follows the key), COWBELL (56). Others: RIMSHOT (37), CLAP (39), SHAKER (69, 70, 82) from the DRUMS presets. Each drum gets a fixed hold length in steps (`DRUM_HOLD`), not the MIDI length.

Levels that worked: drums `volume` 1.4, lead 0.8–0.9, bass 0.95, piano/comping 0.6–0.75. Pan instruments a little (±0.1…0.25), drums and bass centre.

**Ducking** (`duckSource` = drum track id, `duckKeys` = note indexes, `duckDepth` 0–1): bass ducks on the kick (0.45), chords duck on the snare (0.2), the lead ducks on every hit lightly (0.25). Tracks that should not duck: `duckSource: -1, duckKeys: [], duckDepth: 0`.

## 5. Generate

Copy `scripts/gen-spain.py` to `scripts/gen-<song>.py`, edit: `SRC`, `OUT`, `PPQ`, the `step_of()` tempo map, `TRACK_OF` (channel → track id), `DRUM_HOLD`, `TRACKS` (names, colours, timbres, duck), the header comment and export names (`<SONG>_STEPS`, `<SONG>_TRACKS`). Keep the note rules the script already has: a held note is a run of the same index over consecutive steps, so leave a one-step gap before the same pitch restarts; velocity becomes an accent (0/1/2) only when it stands out from the track's median.

```bash
uv run --with mido python3 scripts/gen-<song>.py /path/to/song.mid
```

It prints per track: notes written, notes dropped, total bars. Dropped should be near 0 (out-of-range pitches or >8-note chords).

## 6. Register

1. `src/lib/synth.ts`: import `<SONG>_TRACKS, <SONG>_STEPS`; add a branch in `loadBuiltInSong()` like the SPAIN one (deep-copy tracks, set `totalSteps`, `bpm`, `meter`). Songs written by this skill are already on the 1/24 grid, so **no** `scaleTracksToFineGrid`.
2. `src/lib/stores/synth-patch.ts`: add `{ id, name, steps, bpm, meter }` to `BUILTIN_SONGS`. Only change `DEFAULT_SONG_IDX` if the song should be the boot song, and then also `INITIAL_TRACKS`, `bpm` and `totalSteps` in the synth constructor.

## 7. Verify, then ship

- `npx svelte-check --threshold error` → 0 errors.
- Run the dev server, open `/synth`, LOAD ▼ → the song, PLAY. Check: right tempo, no missing melody, drums audible, no crackle (if it crackles, lower `volume`s; the bus clips above 1.0).
- Compare with the original: is the melody on the right track and octave? Are the cymbals cymbals? Change timbres in the script, re-generate, repeat.
- Commit to `main`, then deploy from `landing-worker/` with `npx wrangler deploy` (from the repo root it deploys the wrong worker). Do not add Claude co-author trailers.

## Files

- `src/lib/songs/spain.ts` — reference output (6 tracks, kit, ducking).
- `scripts/gen-spain.py` — reference generator.
- `src/lib/synth.ts` — `TrackData` fields, `KEY_TIMBRE_KEYS`, `loadBuiltInSong`, `WAVE_PARAM_SPECS`.
- `src/lib/stores/synth-presets.ts` — preset sounds to copy.
