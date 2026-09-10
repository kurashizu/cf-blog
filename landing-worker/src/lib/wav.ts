/** Encode an AudioBuffer as a 16-bit PCM RIFF/WAVE file. */
export function encodeWav(buffer: AudioBuffer): Blob {
	const channels = Math.min(2, buffer.numberOfChannels);
	const frames = buffer.length;
	const bytesPerSample = 2;
	const blockAlign = channels * bytesPerSample;
	const dataBytes = frames * blockAlign;

	const out = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(out);

	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
	};

	ascii(0, 'RIFF');
	view.setUint32(4, 36 + dataBytes, true);
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	view.setUint32(16, 16, true); // PCM fmt chunk size
	view.setUint16(20, 1, true); // format 1 = PCM
	view.setUint16(22, channels, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 8 * bytesPerSample, true);
	ascii(36, 'data');
	view.setUint32(40, dataBytes, true);

	const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
	let offset = 44;
	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < channels; c++) {
			// Clamp before quantising: the render can exceed full scale, and
			// wrapping a sample would turn a loud peak into a click.
			const sample = Math.max(-1, Math.min(1, data[c][i]));
			view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
			offset += bytesPerSample;
		}
	}

	return new Blob([out], { type: 'audio/wav' });
}

/** Peak and RMS of a rendered buffer, in dBFS. */
export function bufferLevels(buffer: AudioBuffer): { peakDb: number; rmsDb: number } {
	let peak = 0;
	let sum = 0;
	let count = 0;
	for (let c = 0; c < buffer.numberOfChannels; c++) {
		const data = buffer.getChannelData(c);
		for (let i = 0; i < data.length; i++) {
			/* A NaN sample would make `peak` NaN, and `NaN > -0.1` is false --
			   so a corrupt render reported no clipping warning at all. Skip
			   what is not a number rather than letting it poison the measure. */
			if (!Number.isFinite(data[i])) continue;
			const v = Math.abs(data[i]);
			if (v > peak) peak = v;
			sum += data[i] * data[i];
			count++;
		}
	}
	const rms = count ? Math.sqrt(sum / count) : 0;
	/* A silent render is -Infinity decibels, which is true and reads as
	   "peak -Infinity dB" in the report. Floor it at the quietest thing 16-bit
	   audio can express, which is what the file would hold anyway. */
	const db = (v: number) => (v <= 0 ? -96 : Math.max(-96, 20 * Math.log10(v)));
	return { peakDb: db(peak), rmsDb: db(rms) };
}
