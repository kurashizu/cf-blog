import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { modularSynth, PIANO_ROLL_NOTES, type VelocityCurve } from '../synth';
import { activeTrackId } from './synth-transport';
import { holdManualNote, releaseManualNote } from './synth-tracks';

export const midiConnectedDevice = writable<string | null>(null);
export const midiDevices = writable<{ id: string; name: string }[]>([]);
export const selectedMidiDevice = writable<string>(modularSynth.getMidiSelectedDeviceId());
export const midiOmniSetting = writable<boolean>(modularSynth.isMidiOmniMode());
export const isSustainActive = writable<boolean>(modularSynth.isSustainActive());
export const velocityCurve = writable<VelocityCurve>(modularSynth.getVelocityCurve());

export function cycleVelocityCurve(): void {
	velocityCurve.set(modularSynth.cycleVelocityCurve());
}

export function setSelectedMidiDevice(deviceId: string): void {
	modularSynth.setMidiSelectedDeviceId(deviceId);
	selectedMidiDevice.set(deviceId);
}

export function setMidiOmni(omni: boolean): void {
	modularSynth.setMidiOmniMode(omni);
	midiOmniSetting.set(omni);
}

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
		const isOmni = modularSynth.isMidiOmniMode();
		const targetTracks = isOmni ? [0, 1, 2, 3, 4, 5] : [get(activeTrackId)];

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
			const name = input.name || `MIDI Device (${input.id})`;
			devList.push({ id: input.id, name });
			if (!firstDeviceName) firstDeviceName = name;
		}
		midiDevices.set(devList);
		midiConnectedDevice.set(firstDeviceName);
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
