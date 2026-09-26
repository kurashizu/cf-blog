# ear

Listens to the synth's built-in sounds the way the unit tests cannot, and
voices them against recordings of the real instruments.

- `ear.py` — an AudioSet model (AST) on a render: which instrument it is heard
  as, and the model's summary of it, for comparing with a recording.
- `body.py`, `make_irs.py` — the IR module's bodies, measured from recordings
  (harmonic levels of many notes over the source's own slope, as a
  minimum-phase impulse). Writes `src/lib/audio/body-irs.ts`.
- `render.cjs`, `render_server.cjs` — renders through the real engine
  (the dev server's `/synth/audit` page must be running on :5182).
- `survey.py`, `verify.py` — every preset against its target (`targets.py`,
  `specs.py`), and against what the recordings themselves score on the same
  phrase.
- `tune.py`, `tune_piano.py`, `apply.py` — CMA-ES over a preset's knobs toward
  the recordings; the piano by octave-band decay against the Iowa Steinway.
- `realplay.py`, `refphrase.py`, `bands.py` — the recordings played on the
  same notes as a render, and the comparisons.

Everything it downloads stays in this directory (`.venv/`, `.cache/`, both
ignored): source `env.sh` first, which points uv, Python, Hugging Face and
torch at `.cache/`.

    source env.sh && uv sync
    uv run survey.py
    uv run tune.py "FULL STRING" --evals 100

The recordings are not in the repo. `.cache/refs/` holds VSCO-2 Community
Edition (CC0, github.com/sgossner/VSCO-2-CE), the University of Iowa MIS
samples (theremin.music.uiowa.edu), and a few Wikimedia Commons pieces used
only to calibrate the ear, never shipped.
