<script lang="ts">
	import BoxHeader from '../chrome/BoxHeader.svelte';
	import AsciiArt from '../chrome/AsciiArt.svelte';
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
	import { fade } from '$lib/perf-transitions';

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
		<AsciiArt
			fit
			color="#e5c07b"
			class="font-black tracking-tight leading-none"
			art={`██╗   ██╗████████╗██╗██╗     ███████╗
██║   ██║╚══██╔══╝██║██║     ██╔════╝
██║   ██║   ██║   ██║██║     ███████╗
██║   ██║   ██║   ██║██║     ╚════██║
╚██████╔╝   ██║   ██║███████╗███████║
 ╚═════╝    ╚═╝   ╚═╝╚══════╝╚══════╝`}
		/>
	</div>

	<!-- Same launchpad-tile look as the sidebar's own hotkey grid: a small
	     card per tool instead of a flat row of pills, so this reads as one
	     consistent pattern across the site rather than two different ways
	     of picking from a list. -->
	<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
		{#each TOOLS as tool (tool.id)}
			{@const isActive = activeTool === tool.id}
			<button
				onclick={() => select(tool.id)}
				title={`${tool.label} — ${tool.desc}`}
				class="lift press border rounded-xs p-1.5 flex flex-col items-start text-left cursor-pointer transition-all min-w-0 {isActive
					? 'border-white bg-white/20 text-white shadow-md'
					: 'border-white/15 bg-black/30 hover:border-white/40 hover:bg-white/5 hover:shadow-[0_2px_10px_-2px_rgba(0,0,0,0.6)]'}"
				style={isActive ? `border-color: ${tool.color}` : undefined}
			>
				<div class="font-bold text-xs leading-tight tracking-tight truncate w-full" style="color: {isActive ? '#fff' : tool.color}">{tool.label}</div>
				<div class="text-[10px] sm:text-xs opacity-60 font-mono truncate w-full">{tool.desc}</div>
			</button>
		{/each}
	</div>

	<div style="border-color: {current.color}66;" class="border p-3 sm:p-4 rounded-sm space-y-2 bg-black/20">
		<BoxHeader title={current.label} class="font-black text-xs sm:text-sm border-b border-white/10 pb-1.5" style="color: {current.color}">
			<span class="text-[10px] sm:text-xs text-white/40 font-mono font-normal">{current.desc}</span>
		</BoxHeader>

		{#key activeTool}
			<div in:fade={{ duration: 140 }}>
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
		{/key}
	</div>
</div>
