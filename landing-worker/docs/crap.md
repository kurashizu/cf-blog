# CRAP — change risk in this codebase

CRAP (Change Risk Anti-Patterns) scores a function on how dangerous it is to
change: complexity weighted by how well tests cover it.

```
CRAP(m) = CC(m)² × (1 − cov(m)/100)³ + CC(m)
```

`CC` is cyclomatic complexity, `cov` the percentage of the function's
statements that tests execute. Fully covered, CRAP collapses to `CC` itself.
Uncovered, it is `CC² + CC` — a CC of 10 scores 110, a CC of 5 scores 30.
**30 is the usual threshold**; above it, either the function is too complex or
it needs tests, and the score does not say which.

## Running it

```sh
npm run test              # unit tests
npm run test:coverage     # tests + coverage/ (CRAP reads this)
npm run crap              # the report, highest risk first
npm run crap -- --covered # only files that have coverage data
npm run crap -- --all     # every function, not just the top 40
npm run test:mutation     # Stryker, writes reports/mutation/
```

`npm run crap` needs `coverage/coverage-final.json`, so run `test:coverage`
first. When `reports/mutation/report.json` exists it adds a `mut%` column.

## Why the mutation score is there too

Coverage says a line *ran*. It does not say a test would *notice* that line
changing. Mutation testing answers the second question: Stryker rewrites the
source (`<` to `<=`, `+` to `-`, deleting a call) and re-runs the suite; a
mutant that survives is a change no assertion caught.

The gap is real and it is the reason both columns are here. Before this pass,
`decodeRLE` and `encodeRLE` sat at 100% statement coverage while
`nextOrientation` scored 22% on mutation — its test asserted that four
rotations return to the start, which is true whichever direction the function
turns, so it could not catch the direction being reversed. That is invisible
to coverage and obvious to mutation testing.

Treat CRAP as "where should tests go" and the mutation score as "are the tests
that exist worth anything".

## What the numbers currently say

The two functions at the top of the whole-codebase list are far beyond
anything else:

| function | file | CC |
| --- | --- | --- |
| `runOne` | `src/lib/stores/console.ts:345` | 189 |
| `triggerTrackVoice` | `src/lib/synth.ts:1517` | 169 |

Third place is 54. Both are command dispatchers — a long `if/else if` chain
over command names, or over track parameters — so the complexity is a shape,
not a tangle, and splitting them into per-command handlers is the obvious
move if either ever needs to change often. Neither is unit tested: both reach
straight into Svelte stores, the SvelteKit runtime and Web Audio.

Below them, 109 functions have CC ≥ 10 and 15 have CC ≥ 30.

Among the files that *are* tested, nothing now scores above 42. The previous
holder was `kindOf` at 702 (CC 26, no coverage); it classifies a Life pattern
by simulating it, so it could be checked against facts — a block is a still
life, a glider is a ship — and the score fell to 26.

## Which files have tests

`vitest.config.ts` lists the modules in `coverage.include`, and
`stryker.config.json` mutates the same list. Both are hand-written rather than
a glob: CRAP is complexity weighted by coverage, so sweeping untestable files
into the denominator would move every score without telling you anything.

The list holds what is genuinely unit-testable — no SvelteKit runtime, no
browser globals, no Web Audio. The ones at the top read input the site does
not control — a `Range` header, a relay frame, a DNS query, a model reply, a
saved disk overlay — which is why they were tested first:

- `src/lib/vm-storage.ts` — parses the `Range` header into byte offsets
- `src/lib/relay-allowlist.ts` — decides what the relay endpoints will connect to
- `src/lib/omniproxy-protocol.ts` — decodes relay frames; splits allowlist entries
- `src/lib/dns-message.ts` — parses wire-format DNS queries and base64url
- `src/lib/components/chatbot/markdown.ts` — renders untrusted model output
- `src/lib/components/krsz-vm/disk-overlay.ts` — replays saved blocks onto a VM disk
- `src/lib/evaluator.ts` — the console's sandboxed maths evaluator
- `src/lib/routes-map.ts` — tab/path mapping and isolated-route navigation
- `src/lib/stores/text-scale.ts` — the screen-size to font-size ladder
- `src/lib/midi-file.ts` — the Standard MIDI File reader
- `src/lib/components/lifelab/engine.js` — the Life automaton
- `src/lib/components/lifelab/patterns.js` — RLE encode/decode and geometry

Add a file to both lists in the same commit that adds its tests, never before.

`tests/unit/route-guards.test.ts` is the exception to that rule: the filename
guards on `/model/[file]` and `/vm/qemu/[file]` are three lines inside route
handlers that also need `platform`, `error()` and a live bucket, so the
patterns are duplicated into the test rather than imported. They are the only
thing standing between a caller and a composed R2 key, and a duplicate that
fails loudly beats no test at all — but if you change a route, change its twin
in the same commit.

## Where the numbers stand

| file | coverage | mutation |
| --- | --- | --- |
| `relay-allowlist.ts` | 100% | 97% |
| `engine.js` | 100% | 95% |
| `omniproxy-protocol.ts` | 100% | 91% |
| `vm-storage.ts` | 100% | 90% |
| `routes-map.ts` | 100% | 85% |
| `evaluator.ts` | 100% | 83% |
| `midi-file.ts` | 98% | 83% |
| `dns-message.ts` | 100% | 82% |
| `patterns.js` | 83% | 82%¹ |
| `text-scale.ts` | 40%² | 81%¹ |
| `disk-overlay.ts` | 88% | 75% |
| `markdown.ts` | 98% | 71%¹ |

Across the tested set: 92% of statements, 93% of lines, 76% mutation score.

¹ Stryker's "covered" column, which excludes mutants in functions no test
reaches. ² The uncovered part is browser-only — localStorage writes and a
resize listener; the pure `autoTextSize` ladder beneath them is fully covered.

Some survivors are equivalent rather than missed. Many of markdown's are
inside the syntax highlighter, where a changed token class is a colour
difference no assertion is worth writing for; in `engine.js`, `v < 250` →
`v <= 250` changes an age cap that would take 250 generations to observe.

`npm test` runs in CI before the build, so a failing test stops the deploy
rather than being reported after the fact.

## Notes on the toolchain

- **Vitest is pinned to 4.x.** With Vitest 5, `@stryker-mutator/vitest-runner@10`
  finishes its dry run and then runs zero tests per mutant, reporting a 0%
  mutation score for a suite that is entirely green. Re-check before lifting
  the pin in `package.json`.
- `stryker.config.json` carries `"ignorePatterns": ["!.svelte-kit/tsconfig.json"]`
  because `tsconfig.json` extends that generated file, and Stryker's sandbox
  would not otherwise copy it — without it every transform fails with
  `TSCONFIG_ERROR`.
- `npm test` runs `svelte-kit sync` first. It has to: the tests resolve through
  Vite, which loads `tsconfig.json`, which extends the generated
  `.svelte-kit/tsconfig.json`. CI skips `npm ci` — and therefore `prepare` —
  whenever the node_modules cache hits, and `.svelte-kit/` is not cached, so
  without the explicit sync the whole suite fails to import on exactly the runs
  that are otherwise fastest.
- Tests stub `$app/environment` (see `tests/unit/stubs/`) rather than booting
  SvelteKit; `browser` is false, so browser-only branches stay skipped.
- `disk-overlay.test.ts` defines a stand-in `Node` class: `findDiskBuffer`
  skips DOM nodes while walking the emulator, and `instanceof Node` throws a
  ReferenceError under plain Node. That is cheaper than adding jsdom for one
  identity check, and nothing under test constructs one.
- `npm run test:mutation` takes about 15 minutes now, most of it `kindOf`:
  mutating a 40-generation simulation produces a lot of timeouts, and a
  timeout has to wait out the clock. Timeouts count as killed, so the score is
  right — it is just slow. The unit suite itself is under three seconds.

## What is not covered, and why

The numbers above describe the 14 modules in the list — not the codebase. For
scale: 166 source files, 84 of them Svelte components, and 68 untested .ts/.js
modules totalling about 20,000 lines. Across all of it, 265 functions score
above CRAP 30; 136 have coverage data at all.

That gap is mostly deliberate. What is left divides into three:

**Needs a browser, not a test runner.** `lm-space/scene.js` (WebGL), `sound.ts`
and `synth.ts` (Web Audio), `lifelab/main.js` (canvas), `krsz-vm/qemu.ts` (an
Emscripten module). These are exercised by using the site; a unit test would
either mock the whole API surface — testing the mock — or need a real browser,
which is a different kind of suite.

**Svelte components.** None are tested. Rendering them needs a DOM and a
component testing setup, and the last attempt to touch components broadly on
this site had to be reverted. Worth doing per-view, one at a time, if ever.

**Genuinely testable, not yet done.** `stores/console.ts` and `synth.ts` are
the two big ones, and both are here because `runOne` and `triggerTrackVoice`
reach straight into stores and Web Audio. Extracting the command table from
`runOne` would make most of it testable — that is a refactor of the console,
not a test-writing exercise, and worth doing when something there needs to
change anyway. `stores/synth-presets.ts`, `synth-patch.ts` and
`v86net/fake-network.js` are smaller versions of the same shape.

The honest summary: the parts that read input the site does not control are
covered and hold up under mutation testing. The parts that draw pixels and
make sound are not, and are not going to be by this route.
