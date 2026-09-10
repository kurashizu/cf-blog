import { describe, it, expect } from 'vitest';
import { CONST_KINDS, MIDI_A4, noteName, noteNumber } from '../../src/lib/stores/synth-modules';
import { PURE_NODES } from '../../src/lib/stores/node-graph';
import { roleOf, rolesCompatible, type PortRole } from '../../src/lib/stores/graph-model';

/**
 * The types a value can have.
 *
 * A number on its own is not a value -- 440 is a frequency, a duration, or a
 * MIDI note depending on what it was meant as -- so CONST names which, and the
 * lattice enforces it from there. These pin the two places that would break
 * silently: the ranges, and the fact that a pitch on a cable is not MIDI.
 */

const kindIndex = (label: string) => CONST_KINDS.findIndex((k) => k.label === label);

describe('the type table', () => {
	it('carries the widths a machine would recognise', () => {
		const range = (label: string) => {
			const k = CONST_KINDS[kindIndex(label)];
			return [k.min, k.max, k.step];
		};
		expect(range('I8')).toEqual([-128, 127, 1]);
		expect(range('U8')).toEqual([0, 255, 1]);
		expect(range('I32')).toEqual([-2147483648, 2147483647, 1]);
		expect(range('U32')).toEqual([0, 4294967295, 1]);
	});

	it('keeps the two unsigned floats apart, because the lattice does', () => {
		/* 440 Hz and 440 seconds are both a positive float, and only one of them
		   belongs on an oscillator. Sharing one type would have made the socket
		   accept either. */
		const frq = CONST_KINDS[kindIndex('FRQ')];
		const sec = CONST_KINDS[kindIndex('SEC')];
		expect(frq.role).toBe('hz');
		expect(sec.role).toBe('time');
		expect(frq.min).toBe(0);
		expect(sec.min).toBe(0);
		expect(frq.unit).toBe('Hz');
		expect(sec.unit).toBe('s');
	});

	it('gives a signal range and a fraction their own types', () => {
		const amp = CONST_KINDS[kindIndex('AMP')];
		const pct = CONST_KINDS[kindIndex('PCT')];
		expect([amp.min, amp.max]).toEqual([-1, 1]);
		expect([pct.min, pct.max]).toEqual([0, 1]);
		// PCT is what an inlet declaring `unit` expects -- PWM's PW, ENTRY's VEL.
		expect(pct.role).toBe('unit');
	});

	it('declares every default inside its own range', () => {
		for (const k of CONST_KINDS) {
			expect(k.def, k.label).toBeGreaterThanOrEqual(k.min);
			expect(k.def, k.label).toBeLessThanOrEqual(k.max);
		}
	});

	it('names each type once', () => {
		const labels = CONST_KINDS.map((k) => k.label);
		expect(new Set(labels).size).toBe(labels.length);
	});

	it('only lets a type reach a socket that wants it', () => {
		const roleOfKind = (label: string) => CONST_KINDS[kindIndex(label)].role as PortRole;
		// A pitch is not a frequency, whichever way round it is asked.
		expect(rolesCompatible(roleOfKind('PIT'), roleOfKind('FRQ'))).toBe(false);
		expect(rolesCompatible(roleOfKind('FRQ'), roleOfKind('PIT'))).toBe(false);
		// And a pitch reaches a pitch.
		expect(rolesCompatible(roleOfKind('PIT'), 'pitch')).toBe(true);
		// A fraction reaches an ordinary control inlet.
		expect(rolesCompatible(roleOfKind('PCT'), roleOf({ kind: 'mod' }))).toBe(true);
	});
});

describe('a note is typed as a name and stored as MIDI', () => {
	it('round-trips the names it shows', () => {
		for (const midi of [0, 21, 36, 60, 69, 108, 127]) {
			expect(noteNumber(noteName(midi))).toBe(midi);
		}
	});

	it('puts middle C at C4 and A4 where MIDI does', () => {
		expect(noteName(60)).toBe('C4');
		expect(noteName(69)).toBe('A4');
		expect(noteName(36)).toBe('C2');
		expect(MIDI_A4).toBe(69);
	});

	it('reads a flat, and refuses what is not a note', () => {
		expect(noteNumber('Db4')).toBe(61);
		expect(noteNumber('C#4')).toBe(61);
		expect(noteNumber('')).toBeNull();
		expect(noteNumber('H4')).toBeNull();
		expect(noteNumber('C99')).toBeNull();
	});

	it('hands a cable semitones from the reference, not the MIDI number', () => {
		/* The engine publishes a pitch as semitones from the tuning reference,
		   where A4 is 0. MIDI puts A4 at 69. Without the conversion every patched
		   note would arrive nearly six octaves high -- and it would still look
		   right on the card, which is why this is pinned rather than trusted. */
		const pit = kindIndex('PIT');
		const emit = (value: number) =>
			PURE_NODES.const({ get: (_p, f) => f }, (key, def) =>
				key === 'kind' ? pit : key === 'value' ? value : def
			);
		expect(emit(69)).toBe(0); // A4
		expect(emit(81)).toBe(12); // an octave up
		expect(emit(57)).toBe(-12); // an octave down
	});

	it('leaves every other type as the number that was typed', () => {
		const emit = (kind: number, value: number) =>
			PURE_NODES.const({ get: (_p, f) => f }, (key, def) =>
				key === 'kind' ? kind : key === 'value' ? value : def
			);
		for (let k = 0; k < CONST_KINDS.length; k++) {
			if (CONST_KINDS[k].label === 'PIT') continue;
			expect(emit(k, 440), CONST_KINDS[k].label).toBe(440);
		}
	});
});
