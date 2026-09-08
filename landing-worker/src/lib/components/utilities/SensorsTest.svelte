<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { playSound } from '../../sound';
	import { t, tr } from '$lib/i18n';

	/**
	 * Real sensor data only. Desktops without motion hardware get a plain
	 * "no events" message after a short wait rather than a fabricated reading —
	 * see the `noEventsAfter` timer below.
	 */

	interface OrientationState {
		alpha: number | null;
		beta: number | null;
		gamma: number | null;
		absolute: boolean;
		webkitCompassHeading?: number;
	}
	interface MotionState {
		acceleration: { x: number | null; y: number | null; z: number | null };
		accelerationIncludingGravity: { x: number | null; y: number | null; z: number | null };
		rotationRate: { alpha: number | null; beta: number | null; gamma: number | null };
		interval: number | null;
	}

	let orientation = $state<OrientationState | null>(null);
	let motion = $state<MotionState | null>(null);
	let gotAnyEvent = $state(false);
	let noEvents = $state(false);
	let permissionDenied = $state(false);

	let needsGesture = $state(false);

	let eventCount = 0;
	let eventRateHz = $state<number | null>(null);

	let noEventsTimer: ReturnType<typeof setTimeout> | null = null;
	let rateInterval: ReturnType<typeof setInterval> | null = null;

	function markEvent() {
		gotAnyEvent = true;
		noEvents = false;
		eventCount++;
		if (noEventsTimer) {
			clearTimeout(noEventsTimer);
			noEventsTimer = null;
		}
	}

	function onOrientation(e: DeviceOrientationEvent) {
		markEvent();
		orientation = {
			alpha: e.alpha,
			beta: e.beta,
			gamma: e.gamma,
			absolute: e.absolute,
			webkitCompassHeading: (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
		};
	}

	function onMotion(e: DeviceMotionEvent) {
		markEvent();
		motion = {
			acceleration: { x: e.acceleration?.x ?? null, y: e.acceleration?.y ?? null, z: e.acceleration?.z ?? null },
			accelerationIncludingGravity: {
				x: e.accelerationIncludingGravity?.x ?? null,
				y: e.accelerationIncludingGravity?.y ?? null,
				z: e.accelerationIncludingGravity?.z ?? null
			},
			rotationRate: { alpha: e.rotationRate?.alpha ?? null, beta: e.rotationRate?.beta ?? null, gamma: e.rotationRate?.gamma ?? null },
			interval: e.interval || null
		};
	}

	function attachListeners() {
		window.addEventListener('deviceorientation', onOrientation);
		window.addEventListener('devicemotion', onMotion);
	}

	function detachListeners() {
		window.removeEventListener('deviceorientation', onOrientation);
		window.removeEventListener('devicemotion', onMotion);
	}

	type PermissionCapable = { requestPermission: () => Promise<'granted' | 'denied'> };

	async function enable() {
		playSound('click');
		const DOE = window.DeviceOrientationEvent as unknown as Partial<PermissionCapable> & typeof DeviceOrientationEvent;
		const DME = window.DeviceMotionEvent as unknown as Partial<PermissionCapable> & typeof DeviceMotionEvent;
		try {
			const results = await Promise.all([
				typeof DOE.requestPermission === 'function' ? DOE.requestPermission() : Promise.resolve('granted' as const),
				typeof DME.requestPermission === 'function' ? DME.requestPermission() : Promise.resolve('granted' as const)
			]);
			if (results.some((r) => r !== 'granted')) {
				permissionDenied = true;
				return;
			}
			needsGesture = false;
			attachListeners();
			armNoEventsTimer();
		} catch {
			permissionDenied = true;
		}
	}

	function armNoEventsTimer() {
		if (noEventsTimer) clearTimeout(noEventsTimer);
		noEventsTimer = setTimeout(() => {
			if (!gotAnyEvent) noEvents = true;
		}, 3000);
	}

	/* ------------------------------- Ambient light ------------------------------- */
	type LightState = 'unsupported' | 'blocked' | 'ok' | 'error';
	let lightState = $state<LightState>('unsupported');
	let lux = $state<number | null>(null);
	let lightErrorMessage = $state('');
	let lightSensor: { start: () => void; stop: () => void } | null = null;

	function startAmbientLight() {
		const Ctor = (window as unknown as { AmbientLightSensor?: new (opts?: { frequency?: number }) => EventTarget & { illuminance?: number; start: () => void; stop: () => void } }).AmbientLightSensor;
		if (!Ctor) {
			lightState = 'unsupported';
			return;
		}
		try {
			const sensor = new Ctor({ frequency: 2 });
			sensor.addEventListener('reading', () => {
				lux = Math.round((sensor.illuminance ?? 0) * 10) / 10;
				lightState = 'ok';
			});
			sensor.addEventListener('error', (ev: Event) => {
				const err = (ev as Event & { error?: { name?: string; message?: string } }).error;
				if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
					lightState = 'blocked';
				} else {
					lightState = 'error';
					lightErrorMessage = err?.message ?? 'unknown';
				}
			});
			sensor.start();
			lightSensor = sensor;
		} catch (e) {
			lightState = e instanceof Error && (e.name === 'SecurityError' || e.name === 'NotAllowedError') ? 'blocked' : 'error';
			lightErrorMessage = e instanceof Error ? e.message : String(e);
		}
	}

	/* --------------------------------- Bubble level -------------------------------- */
	let canvasEl = $state<HTMLCanvasElement>();

	function drawLevel() {
		const canvas = canvasEl;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const size = canvas.width;
		const cx = size / 2;
		const cy = size / 2;
		const r = size * 0.42;

		ctx.clearRect(0, 0, size, size);
		ctx.strokeStyle = 'rgba(255,255,255,0.15)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(cx, cy, r, 0, Math.PI * 2);
		ctx.stroke();
		// Crosshair
		ctx.beginPath();
		ctx.moveTo(cx - r, cy);
		ctx.lineTo(cx + r, cy);
		ctx.moveTo(cx, cy - r);
		ctx.lineTo(cx, cy + r);
		ctx.stroke();

		const beta = orientation?.beta ?? 0;
		const gamma = orientation?.gamma ?? 0;
		// Clamp to +/-45deg mapped across the well radius — enough range to see
		// the bubble move without it vanishing off-canvas on a small tilt.
		const clamp = (v: number) => Math.max(-45, Math.min(45, v));
		const bx = cx + (clamp(gamma) / 45) * r;
		const by = cy + (clamp(beta) / 45) * r;
		const level = Math.abs(beta) < 2 && Math.abs(gamma) < 2;

		ctx.beginPath();
		ctx.arc(bx, by, size * 0.07, 0, Math.PI * 2);
		ctx.fillStyle = level ? 'rgba(152,195,121,0.85)' : 'rgba(97,175,239,0.75)';
		ctx.fill();
		ctx.strokeStyle = 'rgba(0,0,0,0.5)';
		ctx.stroke();
	}

	$effect(() => {
		// Redraw whenever orientation changes.
		void orientation;
		drawLevel();
	});

	/* --------------------------------- lifecycle --------------------------------- */

	onMount(() => {
		const DOE = window.DeviceOrientationEvent as unknown as Partial<{ requestPermission: unknown }> | undefined;
		const DME = window.DeviceMotionEvent as unknown as Partial<{ requestPermission: unknown }> | undefined;
		const needsPermission = typeof DOE?.requestPermission === 'function' || typeof DME?.requestPermission === 'function';
		if (needsPermission) {
			needsGesture = true;
		} else if (typeof window.DeviceOrientationEvent !== 'undefined' || typeof window.DeviceMotionEvent !== 'undefined') {
			attachListeners();
			armNoEventsTimer();
		} else {
			noEvents = true;
		}

		startAmbientLight();

		rateInterval = setInterval(() => {
			eventRateHz = eventCount;
			eventCount = 0;
		}, 1000);

		drawLevel();
	});

	onDestroy(() => {
		detachListeners();
		if (noEventsTimer) clearTimeout(noEventsTimer);
		if (rateInterval) clearInterval(rateInterval);
		lightSensor?.stop();
	});

	function deg(v: number | null): string {
		return v === null ? tr('utilities.sensors.orientation.na') : tr('utilities.sensors.orientation.deg', { deg: Math.round(v * 10) / 10 });
	}
	function ms2(v: number | null): string {
		return v === null ? tr('utilities.sensors.motion.na') : `${Math.round(v * 100) / 100}`;
	}
	function degs(v: number | null): string {
		return v === null ? tr('utilities.sensors.motion.na') : `${Math.round(v * 10) / 10}`;
	}

	let heading = $derived.by(() => {
		if (!orientation) return null;
		if (typeof orientation.webkitCompassHeading === 'number') {
			return { deg: Math.round(orientation.webkitCompassHeading), source: tr('utilities.sensors.compass.source.webkit') };
		}
		if (orientation.absolute && orientation.alpha !== null) {
			return { deg: Math.round((360 - orientation.alpha) % 360), source: tr('utilities.sensors.compass.source.alpha') };
		}
		return null;
	});
</script>

<div class="space-y-3 min-w-0">
	{#if needsGesture}
		<div class="border border-white/15 bg-black/40 rounded-xs p-3 flex flex-wrap items-center gap-2">
			<button
				onclick={enable}
				class="press px-2.5 py-1.5 border border-[#d19a66]/50 text-[#d19a66] rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors"
			>
				{$t('utilities.sensors.enable')}
			</button>
			<span class="text-[11px] font-mono text-white/60">{$t('utilities.sensors.enable.hint')}</span>
		</div>
	{/if}

	{#if permissionDenied}
		<div class="text-xs font-mono text-[#e06c75]">{$t('utilities.sensors.denied')}</div>
	{/if}

	{#if !needsGesture && !gotAnyEvent && !noEvents}
		<div class="text-xs font-mono text-white/60">{$t('utilities.sensors.waiting')}</div>
	{/if}

	{#if noEvents}
		<div class="text-xs font-mono text-white/60">{$t('utilities.sensors.none')}</div>
	{/if}

	{#if gotAnyEvent}
		<div class="flex flex-wrap items-center gap-2">
			<span class="px-2 py-1 border border-white/15 bg-black/40 rounded-xs text-white/60 text-xs font-mono">
				{$t('utilities.sensors.eventRate')} <span class="font-bold text-[#98c379]">{eventRateHz === null ? $t('utilities.sensors.eventRate.na') : $t('utilities.sensors.eventRate.hz', { hz: eventRateHz })}</span>
			</span>
		</div>

		<!-- Orientation -->
		<div class="border rounded-xs bg-black/25 p-2.5 border-[#56b6c2]/20 min-w-0">
			<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
				<span class="text-xs font-black font-mono" style="color: #56b6c2">{$t('utilities.sensors.section.orientation')}</span>
			</div>
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
				<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
					<span class="text-[10px] font-mono font-bold text-white/60 truncate">{$t('utilities.sensors.orientation.alpha')}</span>
					<span class="text-xs font-mono font-bold text-[#56b6c2] truncate">{deg(orientation?.alpha ?? null)}</span>
				</div>
				<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
					<span class="text-[10px] font-mono font-bold text-white/60 truncate">{$t('utilities.sensors.orientation.beta')}</span>
					<span class="text-xs font-mono font-bold text-[#56b6c2] truncate">{deg(orientation?.beta ?? null)}</span>
				</div>
				<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
					<span class="text-[10px] font-mono font-bold text-white/60 truncate">{$t('utilities.sensors.orientation.gamma')}</span>
					<span class="text-xs font-mono font-bold text-[#56b6c2] truncate">{deg(orientation?.gamma ?? null)}</span>
				</div>
				<div class="border border-white/10 bg-black/40 rounded-xs px-2 py-1.5 flex flex-col gap-0.5 min-w-0">
					<span class="text-[10px] font-mono font-bold text-white/60 truncate">{$t('utilities.sensors.orientation.absolute')}</span>
					<span class="text-xs font-mono font-bold text-[#d8dee9] truncate">{orientation?.absolute ? $t('utilities.sensors.orientation.yes') : $t('utilities.sensors.orientation.no')}</span>
				</div>
			</div>
		</div>

		<!-- Motion -->
		{#if motion}
			<div class="border rounded-xs bg-black/25 p-2.5 border-[#e5c07b]/20 min-w-0">
				<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
					<span class="text-xs font-black font-mono" style="color: #e5c07b">{$t('utilities.sensors.section.motion')}</span>
				</div>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
					<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0">
						<span class="text-[10px] font-mono font-bold text-white/60 uppercase truncate">{$t('utilities.sensors.motion.acceleration')} ({$t('utilities.sensors.motion.ms2')})</span>
						<span class="text-xs font-mono font-bold text-[#e5c07b] truncate">{$t('utilities.sensors.motion.axes', { x: ms2(motion.acceleration.x), y: ms2(motion.acceleration.y), z: ms2(motion.acceleration.z) })}</span>
					</div>
					<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0">
						<span class="text-[10px] font-mono font-bold text-white/60 uppercase truncate">{$t('utilities.sensors.motion.accelerationGravity')} ({$t('utilities.sensors.motion.ms2')})</span>
						<span class="text-xs font-mono font-bold text-[#e5c07b] truncate">{$t('utilities.sensors.motion.axes', { x: ms2(motion.accelerationIncludingGravity.x), y: ms2(motion.accelerationIncludingGravity.y), z: ms2(motion.accelerationIncludingGravity.z) })}</span>
					</div>
					<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0">
						<span class="text-[10px] font-mono font-bold text-white/60 uppercase truncate">{$t('utilities.sensors.motion.rotationRate')} ({$t('utilities.sensors.motion.degs')})</span>
						<span class="text-xs font-mono font-bold text-[#e5c07b] truncate">{$t('utilities.sensors.motion.axesDeg', { alpha: degs(motion.rotationRate.alpha), beta: degs(motion.rotationRate.beta), gamma: degs(motion.rotationRate.gamma) })}</span>
					</div>
					<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0">
						<span class="text-[10px] font-mono font-bold text-white/60 uppercase truncate">{$t('utilities.sensors.motion.interval')}</span>
						<span class="text-xs font-mono font-bold text-[#d8dee9] truncate">{motion.interval === null ? $t('utilities.sensors.motion.na') : $t('utilities.sensors.motion.interval.ms', { ms: Math.round(motion.interval * 100) / 100 })}</span>
					</div>
				</div>
			</div>
		{/if}

		<!-- Bubble level + compass -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
			<div class="border rounded-xs bg-black/25 p-2.5 border-[#61afef]/20 min-w-0">
				<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
					<span class="text-xs font-black font-mono" style="color: #61afef">{$t('utilities.sensors.section.level')}</span>
				</div>
				<canvas bind:this={canvasEl} width="180" height="180" class="mx-auto block max-w-full"></canvas>
				<div class="text-[10px] font-mono text-white/50 mt-1.5 text-center">{$t('utilities.sensors.level.hint')}</div>
			</div>

			<div class="border rounded-xs bg-black/25 p-2.5 border-[#c678dd]/20 min-w-0 flex flex-col">
				<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
					<span class="text-xs font-black font-mono" style="color: #c678dd">{$t('utilities.sensors.section.compass')}</span>
				</div>
				{#if heading}
					<div class="flex-1 flex flex-col items-center justify-center gap-1.5">
						<div class="text-2xl font-mono font-black text-[#c678dd]">{$t('utilities.sensors.compass.deg', { deg: heading.deg })}</div>
						<div class="w-full h-2 bg-black/60 border border-white/10 rounded-xs relative overflow-hidden">
							<div class="absolute top-0 bottom-0 w-1.5 rounded-xs bg-[#c678dd]" style="left: calc({(heading.deg / 360) * 100}% - 3px)"></div>
						</div>
						<div class="text-[10px] font-mono text-white/50">{heading.source}</div>
					</div>
				{:else}
					<div class="flex-1 flex items-center justify-center text-[11px] font-mono text-white/50 text-center">{$t('utilities.sensors.compass.na')}</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Ambient light -->
	<div class="border rounded-xs bg-black/25 p-2.5 border-[#98c379]/20 min-w-0">
		<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
			<span class="text-xs font-black font-mono" style="color: #98c379">{$t('utilities.sensors.section.light')}</span>
		</div>
		{#if lightState === 'unsupported'}
			<div class="text-xs font-mono text-white/60">{$t('utilities.sensors.light.unavailable')}</div>
		{:else if lightState === 'blocked'}
			<div class="text-xs font-mono text-[#e5c07b]">{$t('utilities.sensors.light.blocked')}</div>
		{:else if lightState === 'error'}
			<div class="text-xs font-mono text-[#e06c75]">{$t('utilities.sensors.light.error', { message: lightErrorMessage })}</div>
		{:else}
			<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex items-baseline justify-between gap-2 min-w-0 max-w-xs">
				<span class="text-[10px] font-mono font-bold text-white/60 uppercase shrink-0">{$t('utilities.sensors.light.value')}</span>
				<span class="text-xs font-mono font-bold text-[#98c379] truncate">{lux === null ? $t('utilities.sensors.eventRate.na') : $t('utilities.sensors.light.lux', { lux })}</span>
			</div>
		{/if}
	</div>
</div>
