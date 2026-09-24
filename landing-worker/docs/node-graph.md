# The patch graph

How a module is declared, how it is evaluated, and the rules every one of them
follows. Read this before adding a module or changing how one reads its inputs.

## Why this document exists

The engine used to state its rules once per module, and so had them wrong in a
different way each time. An oscillator read the key it was played from whether
or not anything was wired into its PITCH socket. MODES consulted a knob first
and the socket never. STRING declared a socket the builder did not read at all.
Three sockets on three cards that did nothing, and no way to find out short of
playing each one and listening.

None of those were hard bugs. They were the same bug, written three times,
because there were 46 places where a module decided for itself what its inputs
meant. The point of what follows is that a module cannot make that decision any
more.

## The model, after Unreal's Blueprints

Two kinds of wire, and they do not mix.

**Execution** (white, chevron sockets) says _which nodes run, and when_. It
starts at an **event source** -- a module with an exec outlet and no exec
inlet, so nothing upstream ever runs it (`EVENT_SOURCE_TYPES`, derived from
the catalogue rather than a hand-kept list) -- and reaches the nodes that do
something: ask a question, take an action, or **activate** an OUT.

An activation is not "turn this node on". Exec reaching an OUT builds and
starts, from scratch, the whole audio network upstream of it -- fresh
`AudioNode`s, every time, for every event source that fires. KEY-EVENT's THEN
outlet fires once, at the note; its REL outlet fires later, at the real
moment the key comes up, as an independent build against the graph as it
stood when the note began; ON-CHOKE fires when a *different* voice's ACT or
the voice-stealing pool cuts this one off, independent of both. None of these
three builds shares a node with either of the others -- an oscillator THEN
already started cannot be handed to REL's build, because it has been running
since the note began and cannot be rewound to sound like one just struck. A
pure node has nothing to share in the first place: it is pulled fresh by the
resolver on each build, whichever event fired.

**This is why one OUT cannot answer to two event sources.** Audio and mod
cables carry no notion of "which activation this belongs to" -- they are pure
topology, walked backwards from whichever OUT just got activated to find
what it needs built. If THEN and REL both wired their exec to the same OUT,
THEN's own build would find *everything* upstream of that OUT, including a
branch someone drew meaning it to be exclusive to REL, and build it at the
note whether REL ever fired or not. `addCable` refuses the second wire before
this can happen, the same way it refuses an audio cycle: a patch that wants
"THEN plays the voice, REL layers a tail on top" needs two OUT nodes, one per
event source, summing on the track bus the way any two independent voices
already do.

**Data** (coloured, shaped by type) says _where a value comes from_. It is
pulled, not pushed: nobody runs a data node, its consumer asks it for a value
and it asks its own inputs in turn.

Audio is a third thing and travels its own cables. It is dataflow, not
execution: a filter processes what arrives whenever it arrives, and asking when
it "runs" has no answer.

### Pure and impure

Blueprint's distinction, kept exactly.

A node is **impure** if running it _does something_: ACT mutes a voice, OUT
hands the patch to the master. Impure nodes have an exec inlet, and they happen
when execution reaches them.

A node is **pure** if it only computes: the arithmetic, the filters, the
resonators. Pure nodes have no exec pins at all, because there is no answer to
"when does this run". They are evaluated when something reads them.

An exec **outlet** (THEN) is narrower still: it means _and afterwards, this_, so
it needs an afterwards to point at. SEQ has one because a gap has an end. An
oscillator does not -- it runs for as long as the note does -- so a THEN on OSC
would be a socket for a moment that never arrives.

## What a module may know

Deliberately little. A module receives the audio context, a way to read its
inputs, when the note starts and how long it is held. It does not receive the
graph, the cables, or the note itself.

That is not a restriction to work around; it is what makes the rules true by
construction rather than by 46 separate authors remembering them. A `build` that
closes over the note frequency or the raw parameter record has stepped outside
the contract, and the socket it was meant to read is decorative again. No type
system can stop a closure capturing something, so it is enforced by test:
`module-params.test.ts` fails when a declared socket is never read, and when a
parameter is read that nothing declares.

## The one rule about inputs

> **A module reads every input through the resolver, and reaches past it for
> nothing.**

The resolver (`stores/node-graph.ts`) answers one question: _what arrived at
this inlet?_ The cable if there is one, the declared default if there is not.

```ts
const root = cvIn(nodeId, 'pitch', 440); // right
const root = baseFreq; // wrong: ignores the socket
```

This is what makes "an unwired socket falls back to its default" true
everywhere at once, rather than in each place someone remembered to write it.
It is also what makes the canvas honest: if a cable is drawn, it is heard; if it
is not, the default is heard. There is no third case.

A knob is an inlet too. Every parameter can be driven by a cable, and `p(key,
def)` resolves through the same path -- so a value into a knob works on every
module without that module knowing about it.

### A value replaces a knob; a signal adds to it

The two kinds of source into a knob are not the same thing, and the difference
is audible:

| Cable from                            | What it is | What the knob does                   |
| ------------------------------------- | ---------- | ------------------------------------ |
| CONST, ADD, TO-FREQ ... (a pure node) | a number   | **replaced** by it                   |
| ENV, LFO, an audio outlet             | a signal   | **added to** by it, knob is the base |

A pure node has a value to pull, so the resolver pulls it. Everything else is
an AudioParam connection, and Web Audio _sums_ into a param -- so the knob's own
setting is the base the signal moves around.

Returning 0 for the second case is what made `ENV -> VCF.FREQ` -- the first
patch anyone tries -- play silence: the filter opened at 0 Hz and the envelope
added its 0..1 on top of nothing. Measured after the fix: 320 Hz unmodulated,
2068 Hz at the attack, 660 Hz as it decays.

### Every value a pure node reads is a signed float, whatever role drew the cable

`NodeValue` is `number` -- not an int, not a `bool` kept apart from its 0/1
encoding, not a live ramp with its own type. A role (`hz`, `pitch`, `time`,
`bool`, `index`...) governs which sockets a cable is *offered between* and how
the canvas draws it; it says nothing about what a pure node does with the
number once a cable lands. `PURE_NODES.mul` does not know or care whether its
`b` leg carries a frequency, a beat count or a duty cycle -- it multiplies two
floats, because that is what every role collapses into the moment it enters
arithmetic. `cv` is that fallback made a socket in its own right: the diamond,
amber, "an untyped value" a bare inlet with no declared role resolves to
(`roleOf`), and the shape MUL and ADD draw both their legs with, since neither
declares anything narrower.

The one outlet this almost broke is HELD. Everything else ENTRY publishes
(`pitch`, `vel`, `note`, a lane) is a snapshot taken once, at the note --
`entryValue` just returns the number. HELD is not: it ramps continuously for
as long as the activation runs, which is why a real audio module receives it
as a *signal*, wired onto an AudioParam, rather than a value pulled once. A
pure node has no AudioParam for that signal to land on -- `valueOf` pulls it
once, at build, the same as every other pure node -- so routing HELD into one
through the signal path connects it to nothing, and the inlet silently read
back whatever the caller's own fallback happened to be. Measured: a MUL fed
HELD on its `B` leg read exactly as though the cable had never been drawn,
because `read()` special-cased HELD's cable straight to `own` -- the stand-in
for "nothing is wired here" -- for *every* destination, pure nodes included.
Multiplying a frequency by 1 instead of by elapsed time is not a smaller
version of the patch; it is silence about a cable that is plainly drawn on
the canvas, which is the exact class of bug this whole document exists to
keep out.

The fix is not a new mechanism, it is retiring one that reached further than
it should have: `read()` now asks whether the *destination* is a pure node,
not merely whether the source is HELD. A pure node gets HELD's honest pull --
0, since that is where HELD's own ramp starts and a pure node can only ever
be asked at that instant -- and every other destination keeps the live signal
it already had. Any future outlet that is live rather than a snapshot
inherits the same rule for free, because the branch is keyed on what the
destination can do with a value, not on which outlet this one happens to be.

### Bind a knob where you read it

```ts
knob(f.frequency, 'cutoff', 4000); // right: reads, sets, registers
f.frequency.value = p('cutoff', 4000); // wrong: unreachable by cable
```

`knob()` (and `knobPct()` for a 0..100 knob used as a fraction) reads the value,
sets the param and registers it as a modulation target in one line. Six inlets
out of ninety-nine params were registered by hand; the other ninety-three drew a
cable on the canvas and carried nothing. A knob cannot be modulatable in the
catalogue and inert in the engine if the two are the same line.

### A knob that cannot be driven says so

Some knobs are not AudioParams and never can be. STRING's DECAY shapes a bank of
oscillator envelopes built for this note; SPACE's SIZE is the length of a buffer
generated at build time; REED's STIFF is the shape of a waveshaper curve. There
is no param to connect a cable to.

Mark those `fixed: true`. The canvas then stops offering them when a cable is
dropped on the module -- it used to offer whichever knob was declared first,
which is how SEQ's GAP and SCOPE's SPAN got suggested as places to send an
envelope, neither of which the engine reads through a param at all.

`tests/unit/knob-binding.test.ts` enforces both directions: a knob without the
flag must be registered in `mod`, and a knob with it must _not_ be. The flag has
to cost something, or it becomes a place to hide a bug.

### Convert where the knob is read, not where the cable lands

PAN's POS is -100..100 and `pan` is -1..1; DELAY's TIME is milliseconds and
`delayTime` is seconds. `knobAt(target, key, def, scale)` sets the param through
the conversion and puts a gain of the same `scale` in front of the modulation
target, so a CONST of 100 into POS means hard right rather than a hundred times
hard right.

`knobPct` is the common case of this: a knob stored 0..100 and used as a
fraction. Registering the bare param let a cable bypass the divide -- MIX A at
100 is a gain of 1, and a CONST of 100 gave 101.

Not every conversion fits. COMP's GAIN is decibels and its param is a linear
gain, which is exponential, so no scaling node can express it: it is `fixed`,
and a patch that wants to modulate level uses a VCA.

### Both ends of a cable resolve by port name

`outletOf(src, port)` is the source side of what `mod.get(port)` is on the
destination side. The source end used to take `out`, or `out2` for the one port
literally called `r`, and everything else silently fell back to `out` -- so
ENTRY's VEL pin connected ENTRY's _silent_ gain, and a hard hit and a soft one
came out at the same level. If a module publishes an outlet under a name, it
declares it in `outs`.

## Declaring a module

One entry in `MODULE_SPECS` (`stores/synth-modules.ts`):

```ts
{
    id: 'osc',
    label: 'OSC',
    group: 'SOURCE',
    color: '#c678dd',
    descKey: 'synthPatch.mod.osc',
    inputs: [{ id: 'pitch', label: 'FREQ', kind: 'mod', role: 'hz' }],
    outputs: [AUDIO_OUT],
    params: [...]
}
```

Rules:

- **Every declared socket must be read.** A socket the builder ignores is a lie
  drawn on the card. `tests/unit/module-params.test.ts` fails if one is left
  unread.
- **Give it a role.** The role decides the socket's shape and colour and what
  may connect to it; `signal` is the permissive default for audio that takes
  whatever arrives.
- **No knob that duplicates a socket.** OSC has no HZ knob: a CONST set to PITCH
  is how a frequency is pinned. A knob that stops working the moment a cable is
  drawn is worse than no knob.
- **Minimal primitives.** OUT sends audio to the master and does nothing else --
  no level, no pan, because VCA and PAN are already modules. A primitive that
  also mixes is two primitives wearing one coat.

### Port roles

| role             | shape             | carries                         |
| ---------------- | ----------------- | ------------------------------- |
| `exec`           | chevron, white    | execution                       |
| `signal`         | circle, white     | audio, any width                |
| `mono`           | square, white     | audio, one channel              |
| `stereo`         | double ring, cyan | audio, a pair                   |
| `left` / `right` | half-circle, cyan | one side of a split             |
| `cv`             | diamond, amber    | an untyped value                |
| `pitch`          | step, green       | a note on a scale, in semitones |
| `hz`             | triangle, blue    | a frequency                     |
| `unit`           | diamond, red      | an amount, 0..1                 |
| `index`          | hexagon, purple   | a count                         |
| `time`           | square, cyan      | a length of time                |

Types do not mix: exec joins exec, audio joins audio, a value drives a value.

Two pairs are deliberately kept apart, and both have a node for crossing
between them.

**Mono and stereo.** Web Audio would fold a pair into a mono inlet without
saying so, and a patch that sounds narrow gives no hint that a stereo stage
collapsed three modules upstream. MONO, MERGE and SPLIT do the conversion where
you can see it. `left`, `right` and `mono` are all one channel and interchange
freely; only `stereo` is the other width.

**Pitch and frequency.** A pitch is a place on a scale; a frequency is a rate in
hertz. FREQ converts one to the other exactly; PITCH converts back and has to
quantise, because 452 Hz is not a note -- it is between two, and which one it
becomes depends on the tuning reference and on where you round. Both are knobs
on the converter rather than assumptions inside whichever module took the cable,
and both default to the instrument's master tuning. ENTRY publishes a pitch and
an oscillator takes a frequency, so every patch that follows the keyboard has
the conversion visible in it.

## Adding a pure node

Add a row to `PURE_NODES` in `stores/node-graph.ts`:

```ts
add: (i, p) => i.get('a', 0) + i.get('b', p('addB', 0)),
```

That is the whole implementation. It receives resolved inputs and its own
parameters, and returns a number. It cannot see the note, the graph or the audio
context, which is what keeps it honest.

## The note event

ENTRY (labelled KEY-EVENT on the canvas) publishes what the key press was:
`pitch`, `vel`, `note`, `gate`, and one outlet per lane the track carries.
Velocity used to reach the amplifier and nothing else, so "struck harder means
brighter" -- which is what every struck instrument does -- could not be said
at all.

There is one VEL. The velocity lane and a key's own velocity are the same
quantity read two ways: the lane when a part plays back, the key press when it
is played live.

KEY-EVENT has two exec outlets, both belonging to the same key press:

- **THEN** fires at the note, and is what every patch has always used.
- **REL** fires later, at the real moment the key comes up -- not a number
  guessed at note-on, because a continuous hold has no known length and even
  a timed note can be cut short by a choke or a voice steal. `gate` on a REL
  activation reads how long the key was actually held, not the estimate
  THEN's own build was against.

**ON-CHOKE** is a separate module, not a third KEY-EVENT outlet, because it
answers a different question. THEN and REL are both about this key's own
timeline -- when it started, when it let go -- and a KEY-EVENT node can
answer both from its own event alone. Being cut off from outside (another
key stealing this voice's slot, or a different voice's ACT reaching sideways
with CUT or SOLO) is decided by *something else*, at a time this key's own
press cannot predict or own. It fires as its own activation, on its own OUT.

## ADV is its own instrument

A track in ADV plays what the canvas builds and nothing else. ENTRY has no audio
outlet: racks 1-7 are a different instrument, not a stage in front of this one.
A blank patch starts as an oscillator following the keyboard into the output --
ENTRY's pitch through a FREQ converter into an oscillator into OUT, with the
exec cable that lets the sound out -- because a truly empty canvas says nothing
about how the pieces fit and the first thing anyone does is rebuild that by
hand.

## Minimal primitives

A module does one thing. Anything else it appears to do is another module in
disguise, and the ones already found this way were all the same shape:

- SUM had an LVL knob and DIFF an AMT knob: a VCA welded onto an adder.
- OSC had RATIO (a MUL on the frequency), DET (the same in cents), LVL (a VCA)
  and an FM inlet that multiplied what arrived by the note frequency times two
  -- a depth control on no card at all.
- OUT had level and pan, which are VCA and PAN.
- MAKE had a WIDE knob beside its WIDE socket.
- VCA and PAN had a DEPTH on the CV leg: a second VCA scaling the control
  signal before it arrived. It also made two different silences with two
  different causes -- GAIN 0 with DEPTH 100, or the other way round. A CV is
  attenuated where it is made: LFO has AMT.
- NOISE, SUB, PULSE and BOW each kept the LVL knob OSC lost, and PULSE kept
  RATIO too.
- VCF's DEPTH was `cutoff * depth/100`, so the FREQ knob silently scaled the
  modulation: moving the cutoff changed how far the FM inlet reached. It is now
  the swing itself, in hertz, which is what its unit says.
- TUBE's ODD was a two-outcome switch drawn as a 101-position percentage dial.

The test is whether the knob would still make sense if you had to draw it. A
patch that comes out quiet should have one place to look, not three.

### A declared socket must change the sound

STRING and TUBE declared an AUDIO IN and read a `mix` param the catalogue never
declared -- so it was always undefined, always 1, the dry gain was always 0, and
the socket was structurally discarded. A patch heard the same partials whether a
strike was wired in or not.

If a module declares an inlet, wire a signal into it and confirm the output
changes. `tests/unit/module-params.test.ts` checks the port _id_ appears in
`synth.ts`, which the spelling satisfies and the wiring does not.

## Card layout

The rules below are all things that were got wrong at least once, each time in
a way that looked fine in code and broken on screen. Check a card against them
before adding a module or changing how one draws.

### The port labels are drawn outside the card

The canvas paints them over the card's edges, so the card's own controls must
keep out of two gutters. **The gutter is measured from the longest label the
card carries**, not fixed:

```
gutter = longest ? max(12, ceil(14 + longestLabel * 4.4)) : 8   // 7px mono, label 14px in
```

A fixed padding is a guess, and it was wrong twice. At `px-3` the labels sat on
top of the controls; at `px-6` OSC's four-character `FREQ` still ran under its
own waveform buttons, because four characters of 7px monospace starting 14px in
end around 31px and the gutter was 24.

### The gutters are added to the card, not carved out of it

`NODE_W` is what the _controls_ need — four waveform buttons legible at 8px, or
two knobs side by side. The gutters go on top:

```
width = NODE_W + 2 * gutter        // right
width = NODE_W                     // wrong: buttons truncate to "S..." "S..."
```

Subtracting the gutters from the same 176 is what turned SIN/SAW/SQR/TRI into
four identical ellipses.

### A card is as tall as the taller of its controls and its sockets

`portsHeight` spreads sockets at a minimum 22px apart; `bodyHeight` adds up the
control rows. The card takes the larger. ENTRY has five outlets and no knobs, so
its height comes entirely from the sockets.

Two traps here:

- **A measured height of zero is not a height.** The `ResizeObserver` reports
  what the card actually rendered as, which is the right answer whenever there
  is something in it — but a module with no controls renders as nothing, and
  taking that literally collapsed OUT to a title bar with its socket hanging off
  the edge. Floor the measurement at the computed height.
- **A module with no controls still needs a body.** Padding alone left an 8px
  sliver. An empty body is one knob row tall.

### Three kinds of control, for three kinds of question

| question             | control           | declared by      |
| -------------------- | ----------------- | ---------------- |
| which one?           | segmented buttons | `choices: [...]` |
| what number exactly? | typed field       | `field: true`    |
| how much?            | dial              | neither          |

A literal is typed, not turned. CONST's job is to say 440, or 0.75, or 48, and
spelling that out on a 26px dial spanning four million positions is not possible
at all. Conversely a cutoff is a dial: you find it by ear, not by knowing it.

**Labels are three or four characters.** The cells are a fixed width so a row of
them lines up, and `ALWAYS`/`ABOVE`/`BELOW` were being cut to `ALW...`, which is
not a label. They are `ANY`/`ABV`/`BLW` now.

### Frequency and ratio dials are logarithmic

Pitch is heard as a ratio: an octave is a doubling wherever you are. On a linear
dial a 40–18000 Hz cutoff puts everything under 1 kHz — most of what a lowpass
is for — in the bottom five percent of the sweep. Declare `scale: 'log'`; it
needs a strictly positive range, and a ratio should be symmetric about 1 so that
unity sits at twelve o'clock.

And check it reaches the knob. `scale` was declared, tested, and not passed
through `ModuleCard` for a while, so every log dial rendered linear while the
tests went green over the declaration.

### Every socket type has its own shape and colour

Shape and colour both, because either alone is ambiguous: a round amber dot
beside a round white one is two colours of one thing, and shape without colour
asks you to compare outlines at 12px. All sockets are filled — an outlined one
read as disabled rather than as a different kind.

The full table is in the `PORT_STYLE` comment in `PatchCanvas.svelte`, and it
must stay exhaustive: `Record<PortRole, …>` means adding a role without a style
is a type error rather than a silent fallback.

### A visualiser is the module, not a badge on it

SCOPE and FFT exist only to be looked at. At 26px a trace told you a signal was
present and nothing else, which the level meter already does — so they get
96px of height and a 224px-wide card, and the canvas backing store matches so
the drawing is not done at a quarter resolution and stretched.

The small ones stay small on purpose: ADSR and the LFO's curve are read beside
the knobs that set them, and enlarging those would push the controls apart for
no more information.

**A meter has no outlet.** It observes; observing is not a stage in making a
sound. Run a second cable to it from wherever you want to look and it sits at
the end of that branch — which is also what makes it impossible to break a
patch by adding one.

**And it needs its own controls**, for the same reason rack 7's meters have
them: a fixed view hides every other. A scope at one span cannot resolve a kick
and a hi-hat both; a spectrum at one floor either buries the quiet detail or
fills with noise.

When a control sets a window, **check the buffer can hold it**. SPAN went to
100 ms over a 512-sample analyser — 10.7 ms at 48 kHz — so the top ninety
percent of the knob did nothing at all.

### A label must name what it selects

OSC's waveform buttons read SIN / SAW / SQR / TRI over an engine table of
`['sine', 'triangle', 'sawtooth', 'square']`, so three of the four named a wave
other than the one they chose: picking SAW gave a triangle. The choices array
and the table it indexes are the same list written twice — keep them in the
same order, and prefer an order that means something (here, harmonic content:
none, weak odd, strong odd, all).

### The unit decides the shape of the control

`unit: '×'` says a multiplier, which is checked to be log-scaled and centred on

1. A scope's GAIN is not that — it only ever magnifies — so it is dB, like every
   other one-way gain. Getting this wrong is caught by test rather than by eye.

### Name a converter for what it does

`TO-FREQ`, not `FREQ`. The bare noun names the destination and reads as though
the node _is_ a frequency; the hyphen reads as an arrow. Conversions live on
their own `CONVERT` shelf rather than among the arithmetic, because changing
what a value _is_ is not the same as changing what it equals — and the whole
reason those nodes exist is that nothing does it implicitly.

## What this instrument deliberately cannot do

Two families of sound are out of reach, and both are decisions rather than
omissions. Written down so the next person to notice the gap finds the reason
instead of the hole.

### No sample source, because a patch is its graph

Nothing loads or replays recorded audio. The whole catalogue is generators and
processors, and that is what makes a patch self-contained: export the JSON, send
it to someone, open it on another machine, and the same sound comes out. SPACE
already follows this rule — its reverb is a generated impulse rather than an
impulse-response file, and its docstring says so.

A sample source breaks that. The patch would stop being a complete description
of the instrument and become a graph plus a file dependency, which every export,
preset and share would then have to carry. Embedding the audio in the patch
keeps self-containment at the cost of size, and that is the shape any future
version of this should take — but the decision as it stands is not to have one.

What this costs: sampling, slicing, drum machines built on recordings, and
anything else that starts from a captured sound. Additive reconstruction is not
a substitute and this document should not pretend otherwise.

### No hard sync, because there is no AudioWorklet

Hard sync resets a slave oscillator's phase every time a master completes a
cycle. The pitch comes from the master and the timbre from the slave, so sweeping
the slave moves a formant through the spectrum while the note stays put — the
sound of a Prophet-5 lead, and one no filter sweep reaches, because a filter
removes harmonics and sync *creates* them at the discontinuity.

OSC's `PHS` looks like the answer and is not, which is worth stating because it
is the first thing anyone will reach for.

This paragraph used to say PHS could not move, "because `OscillatorNode` has no
phase input and a delay is not one either -- a fixed delay is a different phase
at every frequency". A *fixed* delay, yes. One scaled by the note's own period is
not: half a turn is `0.5 / f` seconds, and measured across five octaves it
cancels against an unshifted copy at every one of them -- 0.00003 at 110 Hz
through 0.00555 at 1760. `delayTime` is a-rate, so a cable on it slides the phase
per sample. PHS is live now, and the claim that it could not be was wrong.

What that gives is phase modulation, which is FM's near relative and welcome. It
is not sync, and the difference is the whole point: rotating a wave is not
resetting one. Rotation produces the same waveform starting somewhere else --
which is why a lone oscillator sounds identical at every PHS, and why the static
case is only audible against a second oscillator. Sync produces a
*discontinuity*, and the discontinuity is the sound.

Measured on the live version, driving a slave's PHS from a master oscillator: the
fundamental follows the *slave*, not the master. Sweeping the slave 220 to 880
drops the energy at the master's 110 Hz from 0.2503 to 0.0518 while the slave's
own partial climbs from 0.2224 to 0.2979. In real sync that first column would
not move at all, because the pitch is the master's. Two oscillators modulating
each other is not one resetting the other.

A note on the implementation, because it is the rule the rest of the engine
follows: a value on PHS keeps the wave table and a signal takes the delay. The
first draft did both, and half a turn plus half a turn is a whole turn -- no
shift at all, measured as 0.8306 where cancellation was expected. Exactly one
mechanism per cable.

It is a genuine primitive by this project's bar: conceptually irreducible, and
not substitutable. Ring modulation at integer ratios was measured as the nearest
candidate and produces the inharmonic sum-and-difference family instead; a
swept-carrier ring sweeps timbre but has no sync formant.

What blocks it is that `OscillatorNode` has no writable phase, so a per-sample
reset needs an `AudioWorklet` — and this engine has none. That is a larger
commitment than one module: a second build artefact, a second thread, and its own
story for offline rendering. It is also a door rather than a module. Granular,
true phase distortion and frequency shifting all sit behind the same one, so the
time to open it is when several of those are wanted together, not for sync alone.

## A known gap the current model does not paint over: a track-level event source

KEY-EVENT and ON-CHOKE are the two `EVENT_SOURCE_TYPES` today, and both are
**per-voice**: each fires for one key press's own graph, built and reaped
alongside that one voice. A transport tick -- one clock advancing every step
regardless of whether any note is held, belonging to no voice at all -- is a
different shape of event source and is not implemented. `onStepListeners`
already exists as a real, independent tick in the sequencer engine, consumed
today only by the UI's playhead; nothing wires it into the graph.

It is a distinct piece of work, not a variant of REL/ON-CHOKE, for three
reasons. A per-voice activation's whole reason to rebuild is that it happens
at most a handful of times across one note's life; a transport tick can fire
many times a second, and rebuilding a fresh `AudioNode` graph on every one of
them is not the same performance shape at all -- it likely wants a
persistent, parameter-driven build rather than "build fresh, every time",
which is the opposite of the rule REL and ON-CHOKE both keep. It has no
`ActiveVoice` to hang a snapshot on, because it is not caused by a note --
its anchor would be the *track*, a new and different kind of "whose activation
is this" than the ones that exist now. And it can fire while no voice is
held at all, which nothing in today's model expects.

None of the work already done should make this harder to add later, and that
was checked rather than assumed:

- `ACTIVATION_TYPES`/`EVENT_SOURCE_TYPES` are derived from the catalogue by
  port shape, not hand-listed by name -- a future STEP module with an exec
  outlet and no exec inlet is picked up by `EVENT_SOURCE_TYPES` automatically.
- `buildActivation`'s `entryType`/`entryPort` parameters already generalise
  past "KEY-EVENT's two outlets": ON-CHOKE proved the seed can be any node
  type with any outlet name, not a hardcoded `'in'`.
- The context a per-voice activation snapshots (`AdvBuildContext` in
  `synth.ts`) is its own type rather than fields folded into `ActiveVoice`
  directly, so a track-level equivalent can exist beside it without the two
  being entangled.

What a STEP design still has to answer, and does not today: where its own
snapshot lives if not on a voice, and what "build fresh every time" should
mean at a rate where that could be many times a second. Neither is solved by
extrapolating from REL or ON-CHOKE, which is why this is recorded as a gap
rather than sketched as a plan.
