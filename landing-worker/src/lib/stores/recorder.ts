import { writable, get } from 'svelte/store';
import { soundEngine, playSound } from '../sound';

export const isRecording = writable<boolean>(false);
export const recSeconds = writable<number>(0);
export const recError = writable<string | null>(null);

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let timer: ReturnType<typeof setInterval> | null = null;

function pickMimeType(): string | null {
	for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
		if (MediaRecorder.isTypeSupported(t)) return t;
	}
	return null;
}

export function startRecording(): void {
	if (get(isRecording)) return;
	recError.set(null);

	if (typeof MediaRecorder === 'undefined') {
		recError.set('MediaRecorder unsupported in this browser');
		return;
	}
	const stream = soundEngine.getRecordingStream();
	const mimeType = pickMimeType();
	if (!stream || !mimeType) {
		recError.set('audio capture unavailable');
		return;
	}

	chunks = [];
	recorder = new MediaRecorder(stream, { mimeType });
	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) chunks.push(e.data);
	};
	recorder.onstop = () => {
		const ext = mimeType.startsWith('audio/mp4') ? 'm4a' : 'webm';
		const blob = new Blob(chunks, { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `krsz-synth-take-${get(recSeconds)}s.${ext}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		chunks = [];
	};

	recorder.start(250);
	recSeconds.set(0);
	timer = setInterval(() => recSeconds.update((s) => s + 1), 1000);
	isRecording.set(true);
	playSound('toggle');
}

export function stopRecording(): void {
	if (!get(isRecording)) return;
	recorder?.stop();
	recorder = null;
	if (timer) clearInterval(timer);
	timer = null;
	isRecording.set(false);
	playSound('click');
}

export function toggleRecording(): void {
	if (get(isRecording)) stopRecording();
	else startRecording();
}
