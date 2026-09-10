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

**Execution** (white, chevron sockets) says *which nodes run, and in what
order*. It starts at ENTRY -- a key going down is the event -- and reaches the
nodes that do something: ask a question, take an action, hand the patch to the
master bus.

**Data** (coloured, shaped by type) says *where a value comes from*. It is
pulled, not pushed: nobody runs a data node, its consumer asks it for a value
and it asks its own inputs in turn.

Audio is a third thing and travels its own cables. It is dataflow, not
execution: a filter processes what arrives whenever it arrives, and asking when
it "runs" has no answer.

### Pure and impure

Blueprint's distinction, kept exactly.

A node is **impure** if running it *does something*: ACT mutes a voice, OUT
hands the patch to the master. Impure nodes have an exec inlet, and they happen
when execution reaches them.

A node is **pure** if it only computes: the arithmetic, the filters, the
resonators. Pure nodes have no exec pins at all, because there is no answer to
"when does this run". They are evaluated when something reads them.

An exec **outlet** (THEN) is narrower still: it means *and afterwards, this*, so
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

The resolver (`stores/node-graph.ts`) answers one question: *what arrived at
this inlet?* The cable if there is one, the declared default if there is not.

```ts
const root = cvIn(nodeId, 'pitch', 440);   // right
const root = baseFreq;                      // wrong: ignores the socket
```

This is what makes "an unwired socket falls back to its default" true
everywhere at once, rather than in each place someone remembered to write it.
It is also what makes the canvas honest: if a cable is drawn, it is heard; if it
is not, the default is heard. There is no third case.

A knob is an inlet too. Every parameter can be driven by a cable, and `p(key,
def)` resolves through the same path -- so a value into a knob works on every
module without that module knowing about it.

## Declaring a module

One entry in `MODULE_SPECS` (`stores/synth-modules.ts`):

```ts
{
    id: 'osc',
    label: 'OSC',
    group: 'SOURCE',
    color: '#c678dd',
    descKey: 'synthPatch.mod.osc',
    inputs: [{ id: 'pitch', label: 'PITCH', kind: 'mod', role: 'hz' }],
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

| role | shape | carries |
|---|---|---|
| `exec` | chevron, white | execution |
| `signal` | circle, white | audio, any width |
| `mono` | square, white | audio, one channel |
| `stereo` | double ring, cyan | audio, a pair |
| `left` / `right` | half-circle, cyan | one side of a split |
| `cv` | diamond, amber | an untyped value |
| `pitch` | step, green | a note on a scale, in semitones |
| `hz` | triangle, blue | a frequency |
| `unit` | diamond, red | an amount, 0..1 |
| `index` | hexagon, purple | a count |
| `time` | square, cyan | a length of time |

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

ENTRY publishes what the key press was: `pitch`, `vel`, `note`, `gate`, and one
outlet per lane the track carries. Velocity used to reach the amplifier and
nothing else, so "struck harder means brighter" -- which is what every struck
instrument does -- could not be said at all.

There is one VEL. The velocity lane and a key's own velocity are the same
quantity read two ways: the lane when a part plays back, the key press when it
is played live.

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

The test is whether the knob would still make sense if you had to draw it. A
patch that comes out quiet should have one place to look, not three.

## Card layout

The rules below are all things that were got wrong at least once, each time in
a way that looked fine in code and broken on screen. Check a card against them
before adding a module or changing how one draws.

### The port labels are drawn outside the card

The canvas paints them over the card's edges, so the card's own controls must
keep out of two gutters. **The gutter is measured from the longest label the
card carries**, not fixed:

```
gutter = max(12, 14 + longestLabel * 4.4)     // 7px monospace, label starts 14px in
```

A fixed padding is a guess, and it was wrong twice. At `px-3` the labels sat on
top of the controls; at `px-6` OSC's four-character `FREQ` still ran under its
own waveform buttons, because four characters of 7px monospace starting 14px in
end around 31px and the gutter was 24.

### The gutters are added to the card, not carved out of it

`NODE_W` is what the *controls* need — four waveform buttons legible at 8px, or
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

| question | control | declared by |
|---|---|---|
| which one? | segmented buttons | `choices: [...]` |
| what number exactly? | typed field | `field: true` |
| how much? | dial | neither |

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
the node *is* a frequency; the hyphen reads as an arrow. Conversions live on
their own `CONVERT` shelf rather than among the arithmetic, because changing
what a value *is* is not the same as changing what it equals — and the whole
reason those nodes exist is that nothing does it implicitly.
