<script lang="ts">
	import BoxHeader from '../chrome/BoxHeader.svelte';
	import AsciiArt from '../chrome/AsciiArt.svelte';
	import { Button } from '$lib/components/ui';
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
	import SpeedTest from './SpeedTest.svelte';
	import GpuTest from './GpuTest.svelte';
	import SensorsTest from './SensorsTest.svelte';
	import MidiMonitor from './MidiMonitor.svelte';
	import UsbHidTest from './UsbHidTest.svelte';
	import ColorTest from './ColorTest.svelte';
	import { fade } from '$lib/perf-transitions';
	import { t } from '$lib/i18n';

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
		| 'speed'
		| 'gpu'
		| 'sensors'
		| 'midi'
		| 'usb'
		| 'color'
		| 'display';

	type GroupId = 'input' | 'display' | 'av' | 'system' | 'skill';

	/* Eighteen tools is too many for one flat grid, so the launchpad is
	   sectioned by what the tool exercises. Order inside a group is the order
	   a person would reach for them. */
	const GROUP_DEFS: { id: GroupId; tools: { id: ToolId; color: string }[] }[] = [
		{
			id: 'input',
			tools: [
				{ id: 'keyboard', color: '#56b6c2' },
				{ id: 'mouse', color: '#c678dd' },
				{ id: 'touch', color: '#56b6c2' },
				{ id: 'gamepad', color: '#e06c75' },
				{ id: 'midi', color: '#c678dd' },
				{ id: 'usb', color: '#56b6c2' }
			]
		},
		{
			id: 'display',
			tools: [
				{ id: 'pixels', color: '#d19a66' },
				{ id: 'color', color: '#e5c07b' },
				{ id: 'display', color: '#98c379' },
				{ id: 'gpu', color: '#98c379' }
			]
		},
		{
			id: 'av',
			tools: [
				{ id: 'audioout', color: '#98c379' },
				{ id: 'mic', color: '#e5c07b' },
				{ id: 'camera', color: '#c678dd' }
			]
		},
		{
			id: 'system',
			tools: [
				{ id: 'net', color: '#e06c75' },
				{ id: 'speed', color: '#61afef' },
				{ id: 'sensors', color: '#d19a66' }
			]
		},
		{
			id: 'skill',
			tools: [
				{ id: 'typing', color: '#e5c07b' },
				{ id: 'reaction', color: '#61afef' }
			]
		}
	];
	const TOOL_DEFS = GROUP_DEFS.flatMap((g) => g.tools);

	let activeTool = $state<ToolId>('keyboard');
	let panelHeading = $state<HTMLHeadingElement>();
	let launchpadEl = $state<HTMLDivElement>();

	function select(id: ToolId) {
		activeTool = id;
		playSound('click');
		// Move a screen-reader user into the panel that just changed -- a sighted
		// visitor sees the swap below the grid, but nothing here would otherwise
		// draw the reader's attention past the tile that was just activated.
		panelHeading?.focus();
	}

	/** Returns focus to the launchpad grid (its first tile) for a keyboard/reader
	 *  user who came from the panel and wants back rather than Shift+Tab-ing out. */
	function backToLaunchpad() {
		playSound('click');
		launchpadEl?.querySelector<HTMLButtonElement>('button')?.focus();
	}

	let TOOLS = $derived(
		TOOL_DEFS.map((tool) => ({
			...tool,
			label: $t(`utilities.view.tool.${tool.id}.label`),
			desc: $t(`utilities.view.tool.${tool.id}.desc`)
		}))
	);

	let current = $derived(TOOLS.find((tool) => tool.id === activeTool) ?? TOOLS[0]);
	let GROUPS = $derived(
		GROUP_DEFS.map((g) => ({
			id: g.id,
			label: $t(`utilities.view.group.${g.id}`),
			tools: g.tools.map((tool) => TOOLS.find((x) => x.id === tool.id)!)
		}))
	);
</script>

<div class="space-y-3 sm:space-y-4 flex-1">
	<div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
		<AsciiArt
			color="#e5c07b"
			class="text-[4px] sm:text-[6px] md:text-[8px] font-black tracking-tight leading-tight overflow-hidden"
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
	<div class="space-y-2" bind:this={launchpadEl}>
		{#each GROUPS as group (group.id)}
			{@const groupActive = group.tools.some((tool) => tool.id === activeTool)}
			{@const groupHeadingId = `utils-group-${group.id}`}
			<div>
				<!-- Section rule in the same ruled-heading idiom as the console's
				     help sections: a short label, then a hairline to the edge. A real
				     h2 so a reader can jump section to section the way a sighted
				     visitor scans the ruled labels. -->
				<div class="flex items-center gap-2 mb-1">
					<h2 id={groupHeadingId} class="text-[10px] font-bold tracking-wider {groupActive ? 'text-white/70' : 'text-white/50'}">{group.label}</h2>
					<span class="flex-1 border-t border-white/10"></span>
					<span class="text-[9px] font-mono text-white/50">{group.tools.length}</span>
				</div>
				<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5" role="group" aria-labelledby={groupHeadingId}>
					{#each group.tools as tool (tool.id)}
						{@const isActive = activeTool === tool.id}
						<button
							onclick={() => select(tool.id)}
							title={$t('utilities.view.tool.hint', { label: tool.label, desc: tool.desc })}
							aria-current={isActive ? 'true' : undefined}
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
			</div>
		{/each}
	</div>

	<div style="border-color: {current.color}66;" class="border p-3 sm:p-4 rounded-sm space-y-2 bg-black/20">
		<BoxHeader title={current.label} class="font-black text-xs sm:text-sm border-b border-white/10 pb-1.5" style="color: {current.color}">
			<span class="text-[10px] sm:text-xs text-white/60 font-mono font-normal">{current.desc}</span>
			<Button variant="ghost" size="xs" onclick={backToLaunchpad} class="font-normal shrink-0">
				{$t('utilities.view.backToLaunchpad')}
			</Button>
		</BoxHeader>
		<h2 bind:this={panelHeading} tabindex="-1" class="sr-only">{current.label}: {current.desc}</h2>

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
				{:else if activeTool === 'speed'}
					<SpeedTest />
				{:else if activeTool === 'gpu'}
					<GpuTest />
				{:else if activeTool === 'sensors'}
					<SensorsTest />
				{:else if activeTool === 'midi'}
					<MidiMonitor />
				{:else if activeTool === 'usb'}
					<UsbHidTest />
				{:else if activeTool === 'color'}
					<ColorTest />
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
