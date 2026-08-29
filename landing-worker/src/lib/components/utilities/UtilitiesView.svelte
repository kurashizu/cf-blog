<script lang="ts">
	import { playSound } from '../../sound';
	import KeyboardTester from './KeyboardTester.svelte';
	import MouseTester from './MouseTester.svelte';
	import DisplayInfo from './DisplayInfo.svelte';
	import TypingTest from './TypingTest.svelte';
	import GamepadTester from './GamepadTester.svelte';
	import ReactionTest from './ReactionTest.svelte';
	import ScreenTest from './ScreenTest.svelte';
	import AudioOutTest from './AudioOutTest.svelte';
	import MicTest from './MicTest.svelte';
	import CameraTest from './CameraTest.svelte';
	import TouchTest from './TouchTest.svelte';
	import NetPowerInfo from './NetPowerInfo.svelte';

	type ToolId =
		| 'keyboard'
		| 'mouse'
		| 'touch'
		| 'typing'
		| 'gamepad'
		| 'reaction'
		| 'pixels'
		| 'audioout'
		| 'mic'
		| 'camera'
		| 'net'
		| 'display';

	const TOOLS: { id: ToolId; label: string; color: string; desc: string }[] = [
		{ id: 'keyboard', label: 'KEYBOARD', color: '#56b6c2', desc: 'Key events, rollover, per-key coverage' },
		{ id: 'mouse', label: 'MOUSE', color: '#c678dd', desc: 'Buttons, wheel, double-click timing, move rate' },
		{ id: 'touch', label: 'TOUCH / PEN', color: '#56b6c2', desc: 'Multi-touch points, stylus pressure, tilt and contact size' },
		{ id: 'typing', label: 'TYPING', color: '#e5c07b', desc: '30-second WPM and accuracy test' },
		{ id: 'gamepad', label: 'GAMEPAD', color: '#e06c75', desc: 'Buttons, axes/drift, rumble (Gamepad API)' },
		{ id: 'reaction', label: 'REACTION', color: '#61afef', desc: 'Visual reaction time, best/avg of 10' },
		{ id: 'pixels', label: 'SCREEN', color: '#d19a66', desc: 'Dead pixels, grayscale, banding, sharpness, text, ghosting' },
		{ id: 'audioout', label: 'AUDIO OUT', color: '#98c379', desc: 'Channel routing, phase, 20Hz-20kHz sweep, device latency' },
		{ id: 'mic', label: 'MIC IN', color: '#e5c07b', desc: 'Level in dBFS, clipping, live spectrum, dominant pitch' },
		{ id: 'camera', label: 'CAMERA', color: '#c678dd', desc: 'Resolution, declared vs delivered frame rate, capabilities' },
		{ id: 'net', label: 'NET / PWR', color: '#e06c75', desc: 'Cloudflare PoP, link estimate, battery, storage, permissions' },
		{ id: 'display', label: 'DISPLAY / SYS', color: '#98c379', desc: 'Resolution, refresh rate, browser environment' }
	];

	let activeTool = $state<ToolId>('keyboard');

	function select(id: ToolId) {
		activeTool = id;
		playSound('click');
	}

	let current = $derived(TOOLS.find((t) => t.id === activeTool) ?? TOOLS[0]);
</script>

<div class="space-y-3 sm:space-y-4 flex-1">
	<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
		<pre class="text-[4px] sm:text-[6px] md:text-[8px] font-black tracking-tight text-[#e5c07b] leading-tight overflow-x-auto select-none">{`██╗   ██╗████████╗██╗██╗     ███████╗
██║   ██║╚══██╔══╝██║██║     ██╔════╝
██║   ██║   ██║   ██║██║     ███████╗
██║   ██║   ██║   ██║██║     ╚════██║
╚██████╔╝   ██║   ██║███████╗███████║
 ╚═════╝    ╚═╝   ╚═╝╚══════╝╚══════╝`}</pre>
		<!-- Wraps rather than scrolls: with a dozen tools a hidden overflow row is undiscoverable -->
		<div class="flex flex-wrap items-center justify-start sm:justify-end gap-1.5 text-xs sm:text-sm">
			{#each TOOLS as tool (tool.id)}
				<button
					onclick={() => select(tool.id)}
					title={`${tool.label} — ${tool.desc}`}
					class="px-2.5 py-1 border rounded-xs cursor-pointer transition-colors whitespace-nowrap {activeTool === tool.id
						? 'border-white bg-white/20 text-white font-bold'
						: 'border-white/20 hover:border-white/60 opacity-70'}"
					style={activeTool === tool.id ? `color: ${tool.color}` : undefined}
				>
					{tool.label}
				</button>
			{/each}
		</div>
	</div>

	<div style="border-color: {current.color}66;" class="border p-3 sm:p-4 rounded-sm space-y-2 bg-black/20">
		<div class="flex items-center justify-between border-b border-white/10 pb-1.5">
			<span class="font-black text-xs sm:text-sm" style="color: {current.color}">┌─[ {current.label} ]─┐</span>
			<span class="text-[10px] sm:text-xs text-white/40 font-mono">{current.desc}</span>
		</div>

		{#if activeTool === 'keyboard'}
			<KeyboardTester />
		{:else if activeTool === 'mouse'}
			<MouseTester />
		{:else if activeTool === 'touch'}
			<TouchTest />
		{:else if activeTool === 'audioout'}
			<AudioOutTest />
		{:else if activeTool === 'mic'}
			<MicTest />
		{:else if activeTool === 'camera'}
			<CameraTest />
		{:else if activeTool === 'net'}
			<NetPowerInfo />
		{:else if activeTool === 'typing'}
			<TypingTest />
		{:else if activeTool === 'gamepad'}
			<GamepadTester />
		{:else if activeTool === 'reaction'}
			<ReactionTest />
		{:else if activeTool === 'pixels'}
			<ScreenTest />
		{:else}
			<DisplayInfo />
		{/if}
	</div>
</div>
