/**
 * A minimal Standard MIDI File reader — enough of SMF 1.0 to turn a `.mid`
 * export into sequencer tracks: note on/off, the first tempo and time
 * signature, and track/instrument names. Controllers, bends and sysex are
 * parsed only far enough to skip them correctly.
 */

export interface MidiNote {
	midi: number;
	/** Absolute ticks from the start of the file. */
	startTick: number;
	endTick: number;
	velocity: number;
	channel: number;
}

export interface MidiTrack {
	name: string;
	notes: MidiNote[];
	/** Channels the notes came from; 9 is the GM percussion channel. */
	channels: number[];
}

export interface MidiFile {
	format: number;
	ticksPerQuarter: number;
	/** From the first set-tempo meta event; 120 when the file states none. */
	bpm: number;
	/** Whether that tempo came from the file or is the MIDI default. */
	bpmFromFile: boolean;
	timeSignature: string;
	tracks: MidiTrack[];
	totalTicks: number;
}

class Reader {
	pos = 0;
	constructor(private readonly view: DataView) {}

	get done(): boolean {
		return this.pos >= this.view.byteLength;
	}
	u8(): number {
		return this.view.getUint8(this.pos++);
	}
	u16(): number {
		const v = this.view.getUint16(this.pos);
		this.pos += 2;
		return v;
	}
	u32(): number {
		const v = this.view.getUint32(this.pos);
		this.pos += 4;
		return v;
	}
	str(len: number): string {
		let s = '';
		for (let i = 0; i < len; i++) s += String.fromCharCode(this.view.getUint8(this.pos + i));
		this.pos += len;
		return s;
	}
	skip(len: number): void {
		this.pos += len;
	}
	/** MIDI variable-length quantity: 7 bits per byte, high bit = continue. */
	varint(): number {
		let value = 0;
		for (let i = 0; i < 4; i++) {
			const byte = this.u8();
			value = (value << 7) | (byte & 0x7f);
			if ((byte & 0x80) === 0) break;
		}
		return value;
	}
}

export class MidiParseError extends Error {}

export function parseMidiFile(buffer: ArrayBuffer): MidiFile {
	const r = new Reader(new DataView(buffer));

	if (r.str(4) !== 'MThd') throw new MidiParseError('Not a MIDI file — missing MThd header.');
	const headerLen = r.u32();
	const format = r.u16();
	const ntrks = r.u16();
	const division = r.u16();
	// Headers are 6 bytes today, but the spec allows longer ones.
	r.skip(headerLen - 6);

	if (division & 0x8000) throw new MidiParseError('SMPTE-timed MIDI files are not supported — export with metrical (PPQ) timing.');
	const ticksPerQuarter = division;
	if (!ticksPerQuarter) throw new MidiParseError('MIDI file declares zero ticks per quarter note.');

	let bpm = 120;
	let bpmFromFile = false;
	let timeSignature = '4/4';
	let sigFromFile = false;
	const tracks: MidiTrack[] = [];
	let totalTicks = 0;

	for (let t = 0; t < ntrks && !r.done; t++) {
		const id = r.str(4);
		const len = r.u32();
		const end = r.pos + len;
		if (id !== 'MTrk') {
			// Unknown chunk types must be skipped, per the spec.
			r.pos = end;
			continue;
		}

		const notes: MidiNote[] = [];
		const channels = new Set<number>();
		/** midi note -> stack of open note-ons, so repeated notes nest correctly. */
		const open = new Map<number, { startTick: number; velocity: number; channel: number }[]>();
		let tick = 0;
		let runningStatus = 0;
		let name = '';

		while (r.pos < end) {
			tick += r.varint();
			let status = r.u8();
			if (status < 0x80) {
				// Running status: reuse the previous status byte, rewind the data byte.
				r.pos--;
				status = runningStatus;
			} else if (status < 0xf0) {
				runningStatus = status;
			}

			const type = status & 0xf0;
			const channel = status & 0x0f;

			if (status === 0xff) {
				const metaType = r.u8();
				const metaLen = r.varint();
				if (metaType === 0x51 && metaLen === 3) {
					const micros = (r.u8() << 16) | (r.u8() << 8) | r.u8();
					if (!bpmFromFile && micros > 0) {
						bpm = Math.round(60_000_000 / micros);
						bpmFromFile = true;
					}
				} else if (metaType === 0x58 && metaLen >= 2) {
					const numerator = r.u8();
					const denominator = 2 ** r.u8();
					r.skip(metaLen - 2);
					if (!sigFromFile) {
						timeSignature = `${numerator}/${denominator}`;
						sigFromFile = true;
					}
				} else if ((metaType === 0x03 || metaType === 0x04) && metaLen > 0) {
					const text = r.str(metaLen).trim();
					if (!name) name = text;
				} else {
					r.skip(metaLen);
				}
				continue;
			}

			if (status === 0xf0 || status === 0xf7) {
				r.skip(r.varint());
				continue;
			}

			if (type === 0x90 || type === 0x80) {
				const note = r.u8();
				const velocity = r.u8();
				channels.add(channel);
				// A note-on with velocity 0 is the conventional note-off.
				if (type === 0x90 && velocity > 0) {
					const stack = open.get(note) ?? [];
					stack.push({ startTick: tick, velocity, channel });
					open.set(note, stack);
				} else {
					const stack = open.get(note);
					const started = stack?.pop();
					if (started && tick > started.startTick) {
						notes.push({
							midi: note,
							startTick: started.startTick,
							endTick: tick,
							velocity: started.velocity,
							channel: started.channel
						});
					}
				}
			} else if (type === 0xc0 || type === 0xd0) {
				r.skip(1);
			} else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
				r.skip(2);
			} else {
				// Unrecognised status: the rest of this track can't be trusted.
				r.pos = end;
				break;
			}
		}

		// Anything still held when the track ends stops at the track end.
		for (const [note, stack] of open) {
			for (const started of stack) {
				if (tick > started.startTick)
					notes.push({ midi: note, startTick: started.startTick, endTick: tick, velocity: started.velocity, channel: started.channel });
			}
		}

		r.pos = end;
		if (notes.length === 0) continue;
		notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
		totalTicks = Math.max(totalTicks, notes[notes.length - 1].endTick);
		tracks.push({ name, notes, channels: [...channels].sort((a, b) => a - b) });
	}

	if (tracks.length === 0) throw new MidiParseError('No note data found in this MIDI file.');

	return { format, ticksPerQuarter, bpm, bpmFromFile, timeSignature, tracks, totalTicks };
}

/**
 * Format 0 files put everything on one track — split by channel so each
 * instrument lands on its own sequencer track instead of one polyphonic pile.
 */
export function splitByChannel(track: MidiTrack): MidiTrack[] {
	const byChannel = new Map<number, MidiNote[]>();
	for (const n of track.notes) {
		const list = byChannel.get(n.channel) ?? [];
		list.push(n);
		byChannel.set(n.channel, list);
	}
	return [...byChannel.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([channel, notes]) => ({
			name: track.name ? `${track.name} ch${channel + 1}` : `ch${channel + 1}`,
			notes,
			channels: [channel]
		}));
}
