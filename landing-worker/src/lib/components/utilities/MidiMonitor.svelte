<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { playSound } from '../../sound';
	import { t } from '$lib/i18n';

	/* This monitor requests its own MIDIAccess and never touches the synth's
	   copy in stores/synth-midi.ts -- two independent Web MIDI clients can
	   coexist fine, the API is designed for that (each caller gets its own
	   MIDIInput objects backed by the same underlying port). */

	const supported = typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;

	type PortInfo = {
		id: string;
		name: string;
		manufacturer: string;
		state: string;
		connection: string;
	};

	interface LogLine {
		id: number;
		t: number;
		dt: number;
		portName: string;
		channel: number | null;
		kind: string;
		detail: string;
		hex: string;
		isRealtime: boolean;
		color: string;
	}

	let requested = $state(false);
	let access: MIDIAccess | null = null;
	let permissionError = $state(false);
	let inputs = $state<PortInfo[]>([]);
	let outputs = $state<PortInfo[]>([]);
	let outputPorts = new Map<string, MIDIOutput>();

	let log = $state<LogLine[]>([]);
	let logId = 0;
	let lastMsgTime: number | null = null;
	let showClock = $state(false);
	let logEl = $state<HTMLDivElement>();

	// held notes: index 0..127, value = velocity (0 = not held)
	let held = $state<number[]>(new Array(128).fill(0));
	// per-channel activity: timestamp of last message, 16 channels
	let channelActivity = $state<number[]>(new Array(16).fill(0));
	let now = $state(Date.now());

	let msgCount = 0;
	let rateWindowStart = Date.now();
	let msgRate = $state(0);

	let selectedOutputId = $state<string>('');

	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
	function noteName(n: number): string {
		const octave = Math.floor(n / 12) - 1;
		return `${NOTE_NAMES[n % 12]}${octave}`;
	}

	// Short names for the CC numbers a synth player actually recognizes on sight.
	const CC_NAMES: Record<number, string> = {
		1: 'mod',
		7: 'volume',
		10: 'pan',
		11: 'expression',
		64: 'sustain',
		71: 'resonance',
		74: 'cutoff',
		91: 'reverb',
		93: 'chorus',
		120: 'all sound off',
		121: 'reset controllers',
		122: 'local control',
		123: 'all notes off',
		126: 'mono mode',
		127: 'poly mode'
	};

	function hex(data: Uint8Array): string {
		return Array.from(data)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join(' ');
	}

	function pushLine(line: Omit<LogLine, 'id' | 'dt'>) {
		const tms = line.t;
		const dt = lastMsgTime === null ? 0 : tms - lastMsgTime;
		lastMsgTime = tms;
		logId++;
		log = [...log.slice(-199), { ...line, id: logId, dt }];
		if (logEl) {
			requestAnimationFrame(() => {
				if (logEl) logEl.scrollTop = logEl.scrollHeight;
			});
		}
	}

	function decode(portName: string, data: Uint8Array) {
		const tms = performance.now();
		msgCount++;
		const status = data[0];
		if (status >= 0xf8) {
			// System real-time: clock 0xF8, start 0xFA, continue 0xFB, stop 0xFC, active sensing 0xFE, reset 0xFF
			if (!showClock) return;
			const names: Record<number, string> = {
				0xf8: $t('utilities.midi.rt.clock'),
				0xfa: $t('utilities.midi.rt.start'),
				0xfb: $t('utilities.midi.rt.continue'),
				0xfc: $t('utilities.midi.rt.stop'),
				0xfe: $t('utilities.midi.rt.activeSensing'),
				0xff: $t('utilities.midi.rt.reset')
			};
			pushLine({
				t: tms,
				portName,
				channel: null,
				kind: $t('utilities.midi.kind.realtime'),
				detail: names[status] ?? $t('utilities.midi.rt.unknown'),
				hex: hex(data),
				isRealtime: true,
				color: '#5c6370'
			});
			return;
		}

		const cmd = status >> 4;
		const channel = (status & 0x0f) + 1;
		channelActivity = channelActivity.map((v, i) => (i === channel - 1 ? Date.now() : v));

		if (cmd === 0x9 || cmd === 0x8) {
			const note = data[1];
			const velocity = data[2] ?? 0;
			const isOn = cmd === 0x9 && velocity > 0;
			held = held.map((v, i) => (i === note ? (isOn ? velocity : 0) : v));
			pushLine({
				t: tms,
				portName,
				channel,
				kind: isOn ? $t('utilities.midi.kind.noteOn') : $t('utilities.midi.kind.noteOff'),
				detail: $t('utilities.midi.detail.note', { note: noteName(note), num: note, velocity }),
				hex: hex(data),
				isRealtime: false,
				color: isOn ? '#98c379' : '#e06c75'
			});
		} else if (cmd === 0xb) {
			const num = data[1];
			const val = data[2];
			const name = CC_NAMES[num];
			pushLine({
				t: tms,
				portName,
				channel,
				kind: $t('utilities.midi.kind.cc'),
				detail: name ? $t('utilities.midi.detail.ccNamed', { num, name, val }) : $t('utilities.midi.detail.cc', { num, val }),
				hex: hex(data),
				isRealtime: false,
				color: '#56b6c2'
			});
		} else if (cmd === 0xc) {
			pushLine({
				t: tms,
				portName,
				channel,
				kind: $t('utilities.midi.kind.pc'),
				detail: $t('utilities.midi.detail.pc', { num: data[1] }),
				hex: hex(data),
				isRealtime: false,
				color: '#e5c07b'
			});
		} else if (cmd === 0xa) {
			pushLine({
				t: tms,
				portName,
				channel,
				kind: $t('utilities.midi.kind.polyAt'),
				detail: $t('utilities.midi.detail.polyAt', { note: noteName(data[1]), pressure: data[2] }),
				hex: hex(data),
				isRealtime: false,
				color: '#c678dd'
			});
		} else if (cmd === 0xd) {
			pushLine({
				t: tms,
				portName,
				channel,
				kind: $t('utilities.midi.kind.chanAt'),
				detail: $t('utilities.midi.detail.chanAt', { pressure: data[1] }),
				hex: hex(data),
				isRealtime: false,
				color: '#c678dd'
			});
		} else if (cmd === 0xe) {
			const raw = (data[2] << 7) | data[1]; // 14-bit, 0..16383, center 8192
			const signed = raw - 8192;
			pushLine({
				t: tms,
				portName,
				channel,
				kind: $t('utilities.midi.kind.pitchBend'),
				detail: $t('utilities.midi.detail.pitchBend', { value: signed }),
				hex: hex(data),
				isRealtime: false,
				color: '#61afef'
			});
		} else {
			pushLine({
				t: tms,
				portName,
				channel,
				kind: $t('utilities.midi.kind.other'),
				detail: $t('utilities.midi.detail.other'),
				hex: hex(data),
				isRealtime: false,
				color: '#5c6370'
			});
		}
	}

	function portInfo(p: MIDIInput | MIDIOutput): PortInfo {
		return {
			id: p.id,
			name: p.name || $t('utilities.midi.port.unnamed'),
			manufacturer: p.manufacturer || 'n/a',
			state: p.state,
			connection: p.connection
		};
	}

	function attachAll(a: MIDIAccess) {
		const ins: PortInfo[] = [];
		for (const input of a.inputs.values()) {
			input.onmidimessage = (ev: MIDIMessageEvent) => {
				if (ev.data) decode(input.name || input.id, ev.data);
			};
			ins.push(portInfo(input));
		}
		inputs = ins;

		const outs: PortInfo[] = [];
		outputPorts.clear();
		for (const output of a.outputs.values()) {
			outputPorts.set(output.id, output);
			outs.push(portInfo(output));
		}
		outputs = outs;
		if (!selectedOutputId && outs.length) selectedOutputId = outs[0].id;
	}

	async function requestAccess() {
		if (!supported) return;
		playSound('click');
		try {
			access = await navigator.requestMIDIAccess({ sysex: false });
			requested = true;
			permissionError = false;
			attachAll(access);
			access.onstatechange = () => {
				if (access) attachAll(access);
			};
		} catch {
			permissionError = true;
			requested = true;
		}
	}

	function clearLog() {
		log = [];
		lastMsgTime = null;
		playSound('click');
	}

	async function sendTestNote() {
		const out = outputPorts.get(selectedOutputId);
		if (!out) return;
		playSound('click');
		const NOTE_ON = 0x90;
		const NOTE_OFF = 0x80;
		out.send([NOTE_ON, 60, 100]);
		setTimeout(() => out.send([NOTE_OFF, 60, 0]), 300);
	}

	function sendAllNotesOff() {
		const out = outputPorts.get(selectedOutputId);
		if (!out) return;
		playSound('click');
		for (let ch = 0; ch < 16; ch++) {
			out.send([0xb0 | ch, 123, 0]);
		}
	}

	let rateTimer: ReturnType<typeof setInterval> | null = null;
	let clockTimer: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		rateTimer = setInterval(() => {
			const elapsed = (Date.now() - rateWindowStart) / 1000;
			msgRate = elapsed > 0 ? Math.round((msgCount / elapsed) * 10) / 10 : 0;
			msgCount = 0;
			rateWindowStart = Date.now();
		}, 1000);
		clockTimer = setInterval(() => (now = Date.now()), 200);
	});

	onDestroy(() => {
		if (rateTimer) clearInterval(rateTimer);
		if (clockTimer) clearInterval(clockTimer);
		if (access) {
			try {
				for (const input of access.inputs.values()) input.onmidimessage = null;
				access.onstatechange = null;
			} catch {
				// best-effort cleanup
			}
		}
	});

	// 5 octaves of held-note strip, C2 (36) .. B6 (95)
	const STRIP_START = 36;
	const STRIP_LEN = 60;
	let stripNotes = $derived(Array.from({ length: STRIP_LEN }, (_, i) => STRIP_START + i));
</script>

<div class="space-y-2">
	{#if !supported}
		<div class="border border-white/15 bg-black/40 rounded-xs p-4 text-xs font-mono text-white/50">
			{$t('utilities.midi.notSupported')}
		</div>
	{:else if !requested}
		<div class="border border-white/15 bg-black/40 rounded-xs p-4 text-center space-y-2">
			<div class="text-xs font-mono text-white/60">{$t('utilities.midi.intro')}</div>
			<button onclick={requestAccess} class="press px-3 py-1.5 border border-[#c678dd]/60 bg-[#c678dd]/10 text-[#c678dd] hover:bg-[#c678dd]/25 rounded-xs font-black text-xs cursor-pointer transition-colors">
				{$t('utilities.midi.requestAccess')}
			</button>
		</div>
	{:else if permissionError}
		<div class="border border-[#e06c75]/40 bg-[#e06c75]/10 rounded-xs p-4 text-xs font-mono text-[#e06c75]">
			{$t('utilities.midi.permissionDenied')}
		</div>
		<button onclick={requestAccess} class="press px-3 py-1.5 border border-white/20 text-white/60 hover:border-white/40 rounded-xs font-bold text-xs cursor-pointer transition-colors">
			{$t('utilities.midi.retry')}
		</button>
	{:else}
		<!-- Ports -->
		<div class="grid grid-cols-1 md:grid-cols-2 gap-2">
			<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1 min-w-0">
				<div class="text-[10px] font-mono font-bold text-white/60 uppercase pb-1 border-b border-white/10">{$t('utilities.midi.inputs', { count: inputs.length })}</div>
				{#if inputs.length === 0}
					<div class="text-[10px] font-mono text-white/50">{$t('utilities.midi.noPorts')}</div>
				{/if}
				{#each inputs as p (p.id)}
					<div class="text-[10px] font-mono flex items-center gap-1.5 min-w-0">
						<span class="w-1.5 h-1.5 rounded-full shrink-0 {p.state === 'connected' ? 'bg-[#98c379]' : 'bg-white/20'}"></span>
						<span class="truncate font-bold text-white/80" title={p.name}>{p.name}</span>
						<span class="text-white/50 truncate shrink-0">{p.manufacturer}</span>
						<span class="text-white/50 shrink-0 ml-auto">{p.state}/{p.connection}</span>
					</div>
				{/each}
			</div>
			<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1 min-w-0">
				<div class="text-[10px] font-mono font-bold text-white/60 uppercase pb-1 border-b border-white/10">{$t('utilities.midi.outputs', { count: outputs.length })}</div>
				{#if outputs.length === 0}
					<div class="text-[10px] font-mono text-white/50">{$t('utilities.midi.noPorts')}</div>
				{/if}
				{#each outputs as p (p.id)}
					<div class="text-[10px] font-mono flex items-center gap-1.5 min-w-0">
						<span class="w-1.5 h-1.5 rounded-full shrink-0 {p.state === 'connected' ? 'bg-[#98c379]' : 'bg-white/20'}"></span>
						<span class="truncate font-bold text-white/80" title={p.name}>{p.name}</span>
						<span class="text-white/50 truncate shrink-0">{p.manufacturer}</span>
						<span class="text-white/50 shrink-0 ml-auto">{p.state}/{p.connection}</span>
					</div>
				{/each}
				{#if outputs.length > 0}
					<div class="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-white/10">
						<select bind:value={selectedOutputId} class="min-w-0 flex-1 bg-black/60 border border-white/15 rounded-xs text-[10px] font-mono text-white/70 px-1.5 py-1">
							{#each outputs as p (p.id)}
								<option value={p.id}>{p.name}</option>
							{/each}
						</select>
						<button onclick={sendTestNote} class="press px-2 py-1 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold text-[10px] cursor-pointer transition-colors">
							{$t('utilities.midi.sendTestNote')}
						</button>
						<button onclick={sendAllNotesOff} class="press px-2 py-1 border border-[#e06c75]/50 text-[#e06c75] hover:bg-[#e06c75]/20 rounded-xs font-bold text-[10px] cursor-pointer transition-colors">
							{$t('utilities.midi.allNotesOff')}
						</button>
					</div>
				{/if}
			</div>
		</div>

		<!-- Held notes strip -->
		<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1 min-w-0">
			<div class="text-[10px] font-mono font-bold text-white/60 uppercase">{$t('utilities.midi.heldNotes')}</div>
			<div class="flex gap-px overflow-x-auto custom-scrollbar">
				{#each stripNotes as n (n)}
					{@const v = held[n]}
					{@const isC = n % 12 === 0}
					<div
						class="h-8 flex-1 min-w-[6px] {isC ? 'border-l border-l-white/25' : ''}"
						style="background-color: {v > 0 ? `rgba(97,175,239,${0.25 + (v / 127) * 0.75})` : 'rgba(255,255,255,0.05)'};"
						title={noteName(n)}
					></div>
				{/each}
			</div>
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.midi.heldNotesRange', { from: noteName(STRIP_START), to: noteName(STRIP_START + STRIP_LEN - 1) })}</div>
		</div>

		<!-- Channel activity + rate -->
		<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1.5">
			<div class="flex items-center justify-between">
				<div class="text-[10px] font-mono font-bold text-white/60 uppercase">{$t('utilities.midi.channelActivity')}</div>
				<div class="text-[10px] font-mono text-white/50">{$t('utilities.midi.rate', { rate: msgRate })}</div>
			</div>
			<div class="grid grid-cols-8 sm:grid-cols-16 gap-1">
				{#each channelActivity as ts, i (i)}
					{@const active = now - ts < 200}
					<div class="flex flex-col items-center gap-0.5">
						<div class="w-full h-3 rounded-xs border border-white/10" style="background-color: {active ? '#98c379' : 'rgba(255,255,255,0.05)'};"></div>
						<span class="text-[8px] font-mono text-white/50">{i + 1}</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Log -->
		<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1.5 min-w-0">
			<div class="flex flex-wrap items-center gap-2">
				<div class="text-[10px] font-mono font-bold text-white/60 uppercase">{$t('utilities.midi.log')}</div>
				<label class="flex items-center gap-1 text-[10px] font-mono text-white/50 cursor-pointer ml-2">
					<input type="checkbox" bind:checked={showClock} class="accent-[#c678dd]" />
					{$t('utilities.midi.showClock')}
				</label>
				<button onclick={clearLog} class="press ml-auto px-2 py-1 border border-white/20 hover:border-[#e06c75] text-white/60 hover:text-[#e06c75] rounded-xs font-bold text-[10px] cursor-pointer transition-colors">
					{$t('utilities.midi.clear')}
				</button>
			</div>
			<div bind:this={logEl} class="h-56 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-0.5 bg-black/60 border border-white/10 rounded-xs p-1.5">
				{#if log.length === 0}
					<div class="text-[10px] font-mono text-white/50 p-1">{$t('utilities.midi.logEmpty')}</div>
				{/if}
				{#each log as line (line.id)}
					<div class="text-[10px] font-mono flex flex-wrap items-baseline gap-x-1.5 min-w-0">
						<span class="text-white/50 shrink-0 w-12 truncate">+{line.dt.toFixed(0)}ms</span>
						<span class="text-white/50 shrink-0 truncate max-w-[80px]" title={line.portName}>{line.portName}</span>
						{#if line.channel !== null}
							<span class="text-white/50 shrink-0">ch{line.channel}</span>
						{/if}
						<span class="font-bold shrink-0" style="color: {line.color}">{line.kind}</span>
						<span class="text-white/70 truncate min-w-0">{line.detail}</span>
						<span class="text-white/50 shrink-0 ml-auto truncate">{line.hex}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
