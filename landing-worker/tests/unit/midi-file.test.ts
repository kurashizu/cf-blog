import { describe, it, expect } from 'vitest';
import { parseMidiFile, splitByChannel, MidiParseError, type MidiTrack } from '../../src/lib/midi-file';

/* ---- helpers: build Standard MIDI Files byte by byte -------------------- */

/** MIDI variable-length quantity. */
function vlq(n: number): number[] {
	const out = [n & 0x7f];
	n >>= 7;
	while (n > 0) {
		out.unshift((n & 0x7f) | 0x80);
		n >>= 7;
	}
	return out;
}

const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function header(format: number, ntrks: number, division: number, extra: number[] = []): number[] {
	return [...ascii('MThd'), ...be32(6 + extra.length), ...be16(format), ...be16(ntrks), ...be16(division), ...extra];
}

function chunk(id: string, body: number[]): number[] {
	return [...ascii(id), ...be32(body.length), ...body];
}

const track = (body: number[]) => chunk('MTrk', body);

function file(...parts: number[][]): ArrayBuffer {
	const bytes = parts.flat();
	return new Uint8Array(bytes).buffer;
}

/** delta-time + note-on, and delta-time + note-off, as raw events. */
const noteOn = (delta: number, note: number, vel = 100, ch = 0) => [...vlq(delta), 0x90 | ch, note, vel];
const noteOff = (delta: number, note: number, ch = 0) => [...vlq(delta), 0x80 | ch, note, 0x40];

/** A minimal one-note file used by several tests. */
function oneNoteFile(): ArrayBuffer {
	return file(header(0, 1, 480), track([...noteOn(0, 60), ...noteOff(480, 60), ...vlq(0), 0xff, 0x2f, 0x00]));
}

/* ---- header ------------------------------------------------------------ */

describe('header', () => {
	it('reads format, division and note data', () => {
		const mid = parseMidiFile(oneNoteFile());
		expect(mid.format).toBe(0);
		expect(mid.ticksPerQuarter).toBe(480);
		expect(mid.tracks).toHaveLength(1);
		expect(mid.tracks[0].notes).toEqual([
			{ midi: 60, startTick: 0, endTick: 480, velocity: 100, channel: 0 }
		]);
		expect(mid.totalTicks).toBe(480);
	});

	it('rejects a file that does not start with MThd', () => {
		const bad = file(ascii('RIFF'), be32(6), be16(0), be16(1), be16(480));
		expect(() => parseMidiFile(bad)).toThrow(MidiParseError);
	});

	it('rejects SMPTE division', () => {
		// high bit set = SMPTE timing, which this reader does not support
		const smpte = file(header(0, 1, 0xe728), track([...noteOn(0, 60), ...noteOff(10, 60)]));
		expect(() => parseMidiFile(smpte)).toThrow(MidiParseError);
	});

	it('rejects a zero tick division', () => {
		const zero = file(header(0, 1, 0), track([...noteOn(0, 60), ...noteOff(10, 60)]));
		expect(() => parseMidiFile(zero)).toThrow(MidiParseError);
	});

	it('skips a longer-than-standard header', () => {
		const mid = parseMidiFile(
			file(header(0, 1, 480, [0x00, 0x00]), track([...noteOn(0, 60), ...noteOff(480, 60)]))
		);
		expect(mid.tracks[0].notes).toHaveLength(1);
	});

	it('throws when no track carries note data', () => {
		const empty = file(header(0, 1, 480), track([...vlq(0), 0xff, 0x2f, 0x00]));
		expect(() => parseMidiFile(empty)).toThrow(MidiParseError);
	});
});

/* ---- tempo and time signature ------------------------------------------ */

describe('tempo and time signature', () => {
	it('defaults to 120bpm 4/4 and says the file did not state them', () => {
		const mid = parseMidiFile(oneNoteFile());
		expect(mid.bpm).toBe(120);
		expect(mid.bpmFromFile).toBe(false);
		expect(mid.timeSignature).toBe('4/4');
	});

	it('reads a set-tempo event', () => {
		// 500000 microseconds per quarter = 120bpm; use 400000 = 150bpm
		const micros = 400_000;
		const tempo = [...vlq(0), 0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff];
		const mid = parseMidiFile(file(header(0, 1, 480), track([...tempo, ...noteOn(0, 60), ...noteOff(480, 60)])));
		expect(mid.bpm).toBe(150);
		expect(mid.bpmFromFile).toBe(true);
	});

	it('keeps the first tempo when a file changes tempo later', () => {
		const t = (micros: number) => [...vlq(0), 0xff, 0x51, 0x03, (micros >> 16) & 0xff, (micros >> 8) & 0xff, micros & 0xff];
		const mid = parseMidiFile(
			file(header(0, 1, 480), track([...t(400_000), ...t(200_000), ...noteOn(0, 60), ...noteOff(480, 60)]))
		);
		expect(mid.bpm).toBe(150);
	});

	it('reads a time signature and its power-of-two denominator', () => {
		// 6/8 -> numerator 6, denominator exponent 3 (2**3 = 8)
		const sig = [...vlq(0), 0xff, 0x58, 0x04, 6, 3, 24, 8];
		const mid = parseMidiFile(file(header(0, 1, 480), track([...sig, ...noteOn(0, 60), ...noteOff(480, 60)])));
		expect(mid.timeSignature).toBe('6/8');
	});

	it('ignores a zero tempo rather than dividing by it', () => {
		const zeroTempo = [...vlq(0), 0xff, 0x51, 0x03, 0, 0, 0];
		const mid = parseMidiFile(file(header(0, 1, 480), track([...zeroTempo, ...noteOn(0, 60), ...noteOff(480, 60)])));
		expect(mid.bpm).toBe(120);
		expect(mid.bpmFromFile).toBe(false);
	});
});

/* ---- events ------------------------------------------------------------ */

describe('note events', () => {
	it('treats a note-on with velocity 0 as a note-off', () => {
		const body = [...noteOn(0, 64, 90), ...vlq(240), 0x90, 64, 0];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		expect(mid.tracks[0].notes).toEqual([
			{ midi: 64, startTick: 0, endTick: 240, velocity: 90, channel: 0 }
		]);
	});

	it('honours running status', () => {
		// one status byte, then bare data pairs for the following events
		const body = [
			...vlq(0), 0x90, 60, 100,   // note on, sets running status
			...vlq(240), 60, 0,         // running status: note on vel 0 = off
			...vlq(0), 62, 100,         // running status: note on
			...vlq(240), 62, 0
		];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		expect(mid.tracks[0].notes.map((n) => n.midi)).toEqual([60, 62]);
	});

	it('nests repeated note-ons of the same pitch', () => {
		const body = [
			...noteOn(0, 60, 80),
			...noteOn(120, 60, 90),
			...noteOff(120, 60),
			...noteOff(120, 60)
		];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		const notes = mid.tracks[0].notes;
		expect(notes).toHaveLength(2);
		// the stack pops the most recent note-on first
		expect(notes.map((n) => [n.startTick, n.endTick])).toEqual([
			[0, 360],
			[120, 240]
		]);
	});

	it('closes notes still held at the end of the track', () => {
		const body = [...noteOn(0, 60), ...vlq(480), 0xff, 0x2f, 0x00];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		expect(mid.tracks[0].notes).toEqual([
			{ midi: 60, startTick: 0, endTick: 480, velocity: 100, channel: 0 }
		]);
	});

	it('drops a zero-length note', () => {
		const body = [...noteOn(0, 60), ...noteOff(0, 60), ...noteOn(0, 62), ...noteOff(240, 62)];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		expect(mid.tracks[0].notes.map((n) => n.midi)).toEqual([62]);
	});

	it('records every channel the notes came from', () => {
		const body = [
			...noteOn(0, 60, 100, 0),
			...noteOff(240, 60, 0),
			...noteOn(0, 62, 100, 9),
			...noteOff(240, 62, 9)
		];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		expect(mid.tracks[0].channels).toEqual([0, 9]);
	});

	it('sorts notes by start tick then pitch', () => {
		const body = [
			...noteOn(0, 67),
			...noteOn(0, 60),
			...noteOff(240, 67),
			...noteOff(0, 60)
		];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		expect(mid.tracks[0].notes.map((n) => n.midi)).toEqual([60, 67]);
	});
});

describe('events that are skipped, not interpreted', () => {
	it('skips control change, pitch bend and aftertouch', () => {
		const body = [
			...vlq(0), 0xb0, 7, 100,     // control change (2 data bytes)
			...vlq(0), 0xe0, 0x00, 0x40, // pitch bend (2 data bytes)
			...vlq(0), 0xa0, 60, 64,     // poly aftertouch (2 data bytes)
			...vlq(0), 0xc0, 5,          // program change (1 data byte)
			...vlq(0), 0xd0, 90,         // channel aftertouch (1 data byte)
			...noteOn(0, 60),
			...noteOff(480, 60)
		];
		const mid = parseMidiFile(file(header(0, 1, 480), track(body)));
		expect(mid.tracks[0].notes).toHaveLength(1);
		expect(mid.tracks[0].notes[0].startTick).toBe(0);
	});

	it('skips sysex', () => {
		const sysex = [...vlq(0), 0xf0, ...vlq(3), 0x7e, 0x00, 0xf7];
		const mid = parseMidiFile(file(header(0, 1, 480), track([...sysex, ...noteOn(0, 60), ...noteOff(480, 60)])));
		expect(mid.tracks[0].notes).toHaveLength(1);
	});

	it('skips an unknown meta event', () => {
		const marker = [...vlq(0), 0xff, 0x06, 0x04, ...ascii('mark')];
		const mid = parseMidiFile(file(header(0, 1, 480), track([...marker, ...noteOn(0, 60), ...noteOff(480, 60)])));
		expect(mid.tracks[0].notes).toHaveLength(1);
	});

	it('skips a non-MTrk chunk', () => {
		const mid = parseMidiFile(
			file(
				header(0, 2, 480),
				chunk('XFIH', [1, 2, 3, 4]),
				track([...noteOn(0, 60), ...noteOff(480, 60)])
			)
		);
		expect(mid.tracks).toHaveLength(1);
	});
});

describe('track names', () => {
	it('takes the track name meta event', () => {
		const name = [...vlq(0), 0xff, 0x03, 5, ...ascii('Piano')];
		const mid = parseMidiFile(file(header(0, 1, 480), track([...name, ...noteOn(0, 60), ...noteOff(480, 60)])));
		expect(mid.tracks[0].name).toBe('Piano');
	});

	it('takes an instrument name when there is no track name', () => {
		const instrument = [...vlq(0), 0xff, 0x04, 4, ...ascii('Bass')];
		const mid = parseMidiFile(file(header(0, 1, 480), track([...instrument, ...noteOn(0, 60), ...noteOff(480, 60)])));
		expect(mid.tracks[0].name).toBe('Bass');
	});

	it('keeps the first name when a track carries several', () => {
		const first = [...vlq(0), 0xff, 0x03, 5, ...ascii('First')];
		const second = [...vlq(0), 0xff, 0x03, 6, ...ascii('Second')];
		const mid = parseMidiFile(
			file(header(0, 1, 480), track([...first, ...second, ...noteOn(0, 60), ...noteOff(480, 60)]))
		);
		expect(mid.tracks[0].name).toBe('First');
	});

	it('leaves the name empty when the file states none', () => {
		expect(parseMidiFile(oneNoteFile()).tracks[0].name).toBe('');
	});
});

describe('multi-track files', () => {
	it('reads every track and the longest end tick', () => {
		const mid = parseMidiFile(
			file(
				header(1, 2, 480),
				track([...noteOn(0, 60), ...noteOff(480, 60)]),
				track([...noteOn(0, 67), ...noteOff(960, 67)])
			)
		);
		expect(mid.format).toBe(1);
		expect(mid.tracks).toHaveLength(2);
		expect(mid.totalTicks).toBe(960);
	});

	it('drops tracks that carry no notes', () => {
		const mid = parseMidiFile(
			file(
				header(1, 2, 480),
				track([...vlq(0), 0xff, 0x2f, 0x00]),
				track([...noteOn(0, 60), ...noteOff(480, 60)])
			)
		);
		expect(mid.tracks).toHaveLength(1);
	});
});

/* ---- splitByChannel ---------------------------------------------------- */

describe('splitByChannel', () => {
	const base: MidiTrack = {
		name: 'Mixed',
		channels: [0, 2],
		notes: [
			{ midi: 60, startTick: 0, endTick: 240, velocity: 100, channel: 0 },
			{ midi: 40, startTick: 0, endTick: 120, velocity: 90, channel: 2 },
			{ midi: 64, startTick: 240, endTick: 480, velocity: 100, channel: 0 }
		]
	};

	it('splits one track into a track per channel, in channel order', () => {
		const out = splitByChannel(base);
		expect(out).toHaveLength(2);
		expect(out[0].channels).toEqual([0]);
		expect(out[1].channels).toEqual([2]);
		expect(out[0].notes.map((n) => n.midi)).toEqual([60, 64]);
		expect(out[1].notes.map((n) => n.midi)).toEqual([40]);
	});

	it('names each split track after the source and its 1-based channel', () => {
		const out = splitByChannel(base);
		expect(out.map((t) => t.name)).toEqual(['Mixed ch1', 'Mixed ch3']);
	});

	it('falls back to a bare channel name when the source has none', () => {
		const out = splitByChannel({ ...base, name: '' });
		expect(out.map((t) => t.name)).toEqual(['ch1', 'ch3']);
	});

	it('returns a single track unchanged when all notes share a channel', () => {
		const single: MidiTrack = {
			name: 'Solo',
			channels: [0],
			notes: [{ midi: 60, startTick: 0, endTick: 240, velocity: 100, channel: 0 }]
		};
		const out = splitByChannel(single);
		expect(out).toHaveLength(1);
		expect(out[0].notes).toEqual(single.notes);
	});

	it('returns nothing for a track with no notes', () => {
		expect(splitByChannel({ name: 'Empty', channels: [], notes: [] })).toEqual([]);
	});
});
