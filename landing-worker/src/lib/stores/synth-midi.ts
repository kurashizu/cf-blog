import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { tr } from '$lib/i18n';
import { modularSynth, PIANO_ROLL_NOTES, TRACK_COUNT, type VelocityCurve } from '../synth';
import { activeTrackId } from './synth-transport';
import { holdManualNote, releaseManualNote } from './synth-tracks';

/* Which input plays which track, kept across visits: a keyboard listed twice
   would otherwise be re-silenced only after the defaulting pass runs, and a
   player who pointed two keyboards at two tracks would set them up again every
   reload. Cleared from the CFG dialog like every other stored preference --
   GlobalSettings.svelte imports this key rather than repeating the literal. */
export const MIDI_ROUTING_KEY = 'krsz.synth.midi-routing.v1';

function loadRouting(): void {
	if (!browser) return;
	try {
		const raw = localStorage.getItem(MIDI_ROUTING_KEY);
		if (!raw) return;
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
		const { tracks, seen } = parsed as { tracks?: unknown; seen?: unknown };
		if (tracks && typeof tracks === 'object' && !Array.isArray(tracks)) {
			for (const [id, list] of Object.entries(tracks as Record<string, unknown>)) {
				// A stored file is whatever is in localStorage: take only what the
				// synth can actually route to, and drop the rest silently.
				if (!Array.isArray(list)) continue;
				const clean = list.filter((t): t is number => Number.isInteger(t) && t >= 0 && t < TRACK_COUNT);
				if (clean.length === list.length) modularSynth.setMidiDeviceTracks(id, clean);
			}
		}
		// Devices set to "follow the active track" have no row above, so without
		// this they would be defaulted back to off on the next load.
		if (Array.isArray(seen)) modularSynth.markMidiDevicesSeen(seen.filter((id): id is string => typeof id === 'string'));
	} catch {
		/* unreadable or private mode -- start from the defaults */
	}
}

function saveRouting(tracks: Record<string, number[]>): void {
	if (!browser) return;
	try {
		localStorage.setItem(MIDI_ROUTING_KEY, JSON.stringify({ tracks, seen: modularSynth.getMidiDevicesSeen() }));
	} catch {
		/* quota / private mode */
	}
}

loadRouting();

export const midiConnectedDevice = writable<string | null>(null);
export const midiDevices = writable<{ id: string; name: string }[]>([]);
export const selectedMidiDevice = writable<string>(modularSynth.getMidiSelectedDeviceId());
export const isSustainActive = writable<boolean>(modularSynth.isSustainActive());
export const velocityCurve = writable<VelocityCurve>(modularSynth.getVelocityCurve());

export function cycleVelocityCurve(): void {
	velocityCurve.set(modularSynth.cycleVelocityCurve());
}

export function setSelectedMidiDevice(deviceId: string): void {
	modularSynth.setMidiSelectedDeviceId(deviceId);
	selectedMidiDevice.set(deviceId);
}

/** device id -> tracks it plays; a device missing here follows the active track,
    and one listed with no tracks is switched off. */
export const midiDeviceTracks = writable<Record<string, number[]>>(modularSynth.getMidiDeviceTracks());
if (browser) midiDeviceTracks.subscribe(saveRouting);

/** Add or remove one track from a device's set. */
export function toggleMidiDeviceTrack(deviceId: string, trackId: number): void {
	modularSynth.toggleMidiDeviceTrack(deviceId, trackId);
	midiDeviceTracks.set(modularSynth.getMidiDeviceTracks());
}

/** Follow the active track (null), or switch the input off (empty list). */
export function setMidiDeviceTracks(deviceId: string, trackIds: number[] | null): void {
	modularSynth.setMidiDeviceTracks(deviceId, trackIds);
	midiDeviceTracks.set(modularSynth.getMidiDeviceTracks());
}

/* The inputs whose notes reach the track being edited -- what the keyboard's
   MIDI badge names. A device with no binding follows whatever is selected, so
   it is listed for every track; a bound one only for the tracks it names, and
   one switched off for none. Reading the first connected device instead, as
   the badge used to, named a keyboard that might be routed elsewhere. */
export const midiInputsForActiveTrack = derived(
	[midiDevices, midiDeviceTracks, activeTrackId],
	([$devices, $bound, $active]) =>
		$devices.filter((d) => ($bound[d.id] ?? [$active]).includes($active)).map((d) => d.name)
);

export function setSustainPedal(down: boolean): void {
	modularSynth.setSustainPedal(down);
	isSustainActive.set(down);
}

/** Wires the Web MIDI API — call once, client-side, from onMount. Always routes to the latest activeTrackId. */
export function initMidi(): () => void {
	if (!browser || !navigator.requestMIDIAccess) return () => {};

	let midiAccess: MIDIAccess | null = null;

	const handleMidiMessage = (event: MIDIMessageEvent) => {
		const selectedDevId = modularSynth.getMidiSelectedDeviceId();
		const target = event.target as MIDIInput | null;
		if (selectedDevId !== 'all' && target?.id && target.id !== selectedDevId) return;

		const data = event.data;
		if (!data || data.length < 2) return;
		const cmd = data[0] >> 4;
		const noteNumber = data[1];
		const velocity = data.length > 2 ? data[2] : 0;
		/* A device plays the tracks it names, whatever is selected on screen: two
		   keyboards can drive two tracks at once, one keyboard can layer several
		   under a key, and a keyboard the OS lists twice (USB and Bluetooth for
		   the same instrument) can have its duplicate switched off. Inputs with
		   no binding follow the active track. */
		const targetTracks = modularSynth.getMidiTracksFor(target?.id, get(activeTrackId));
		if (!targetTracks.length) return; // switched off

		if (cmd === 9 && velocity > 0) {
			const noteIdx = 108 - noteNumber;
			if (noteIdx >= 0 && noteIdx < PIANO_ROLL_NOTES.length) {
				targetTracks.forEach((trkId) => holdManualNote(trkId, noteIdx, velocity));
			}
		} else if (cmd === 8 || (cmd === 9 && velocity === 0)) {
			const noteIdx = 108 - noteNumber;
			if (noteIdx >= 0 && noteIdx < PIANO_ROLL_NOTES.length) {
				targetTracks.forEach((trkId) => releaseManualNote(trkId, noteIdx));
			}
		} else if (cmd === 11 && noteNumber === 64) {
			setSustainPedal(velocity >= 64);
		}
	};

	const attachInputs = (access: MIDIAccess) => {
		const devList: { id: string; name: string }[] = [];
		let firstDeviceName: string | null = null;
		for (const input of access.inputs.values()) {
			input.onmidimessage = handleMidiMessage;
			const name = input.name || tr('synth.midi.deviceFallbackName', { id: input.id });
			devList.push({ id: input.id, name });
			if (!firstDeviceName) firstDeviceName = name;
		}

		/* Only the first input plays by default; the rest arrive switched off.
		   One keyboard is routinely listed twice -- a Roland GO:KEYS on USB is
		   advertised over Bluetooth as well -- and letting both through voiced
		   every key press twice, about 10 ms apart, which sounds like a flam on
		   every note. Silence is the safe default: a second input that is really
		   a second keyboard is one click from playing, whereas a duplicate that
		   plays by default is a bug the player has to diagnose by ear.

		   Only inputs never seen before are defaulted, so unplugging a cable
		   does not overwrite choices already made. */
		modularSynth.defaultUnroutedMidiDevices(devList.map((d) => d.id));

		midiDevices.set(devList);
		midiConnectedDevice.set(firstDeviceName);
		midiDeviceTracks.set(modularSynth.getMidiDeviceTracks());
	};

	navigator
		.requestMIDIAccess({ sysex: false })
		.then((access) => {
			midiAccess = access;
			attachInputs(access);
			access.onstatechange = () => attachInputs(access);
		})
		.catch(() => {
			// MIDI not permitted or unsupported
		});

	return () => {
		if (midiAccess) {
			try {
				for (const input of midiAccess.inputs.values()) input.onmidimessage = null;
			} catch {
				// best-effort cleanup
			}
		}
	};
}
