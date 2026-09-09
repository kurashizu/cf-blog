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
