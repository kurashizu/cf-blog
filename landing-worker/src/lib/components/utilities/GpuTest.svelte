<script lang="ts">
	import { onDestroy } from 'svelte';
	import { playSound } from '../../sound';
	import { t, tr } from '$lib/i18n';

	interface Row {
		label: string;
		value: string;
		title?: string;
	}

	/* ---------------------------------------------------------------------- */
	/* WebGL: a throwaway context read once at mount, then explicitly lost —   */
	/* this tool exists to report capabilities, not to hold a live context.   */
	/* ---------------------------------------------------------------------- */

	let webglRows = $state<Row[]>([]);
	let webglExtensions = $state<string[]>([]);
	let webglExtensionsOpen = $state(false);
	let webglAvailable = $state(true);

	function readWebgl() {
		const canvas = document.createElement('canvas');
		const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null;
		if (!gl) {
			webglAvailable = false;
			return;
		}
		const dbg = gl.getExtension('WEBGL_debug_renderer_info');
		const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
		const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
		const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;

		webglRows = [
			{ label: tr('utilities.gpu.webgl.vendor'), value: String(vendor), title: tr(dbg ? 'utilities.gpu.webgl.unmaskedNote' : 'utilities.gpu.webgl.maskedNote') },
			{ label: tr('utilities.gpu.webgl.renderer'), value: String(renderer), title: tr(dbg ? 'utilities.gpu.webgl.unmaskedNote' : 'utilities.gpu.webgl.maskedNote') },
			{ label: tr('utilities.gpu.webgl.version'), value: String(gl.getParameter(gl.VERSION)) },
			{ label: tr('utilities.gpu.webgl.glslVersion'), value: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)) },
			{ label: tr('utilities.gpu.webgl.maxTextureSize'), value: `${gl.getParameter(gl.MAX_TEXTURE_SIZE)}` },
			{ label: tr('utilities.gpu.webgl.maxRenderbufferSize'), value: `${gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)}` },
			{ label: tr('utilities.gpu.webgl.maxViewportDims'), value: `${viewport[0]} × ${viewport[1]}` },
			{ label: tr('utilities.gpu.webgl.maxVertexUniforms'), value: `${gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)}` },
			{ label: tr('utilities.gpu.webgl.maxFragmentUniforms'), value: `${gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)}` }
		];
		webglExtensions = (gl.getSupportedExtensions() ?? []).slice().sort();

		// Explicitly lose the context: this canvas is never attached to the DOM
		// and never drawn to again, so freeing the GPU resource now is cleaner
		// than waiting on GC.
		const lose = gl.getExtension('WEBGL_lose_context');
		lose?.loseContext();
	}

	/* ---------------------------------------------------------------------- */
	/* WebGPU: adapter info + limits, feature-detected per browser.           */
	/* ---------------------------------------------------------------------- */

	let webgpuRows = $state<Row[]>([]);
	let webgpuFeatures = $state<string[]>([]);
	let webgpuFeaturesOpen = $state(false);
	let webgpuState = $state<'unavailable' | 'noAdapter' | 'ok'>('unavailable');

	async function readWebgpu() {
		const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
		if (!gpu) {
			webgpuState = 'unavailable';
			return;
		}
		try {
			const adapter = await gpu.requestAdapter();
			if (!adapter) {
				webgpuState = 'noAdapter';
				return;
			}
			// `adapter.info` is the current spec; older Chrome only had the
			// async requestAdapterInfo() method. Try both, honestly reporting
			// n/a fields rather than guessing.
			type LegacyAdapter = { requestAdapterInfo?: () => Promise<GPUAdapterInfo> };
			const legacy = adapter as unknown as LegacyAdapter;
			const info: Partial<GPUAdapterInfo> = adapter.info ?? (legacy.requestAdapterInfo ? await legacy.requestAdapterInfo() : {});
			const limits = adapter.limits;
			const na = tr('utilities.gpu.na');

			webgpuRows = [
				{ label: tr('utilities.gpu.webgpu.vendor'), value: info.vendor || na },
				{ label: tr('utilities.gpu.webgpu.architecture'), value: info.architecture || na },
				{ label: tr('utilities.gpu.webgpu.device'), value: info.device || na },
				{ label: tr('utilities.gpu.webgpu.description'), value: info.description || na },
				{ label: tr('utilities.gpu.webgpu.preferredFormat'), value: gpu.getPreferredCanvasFormat() },
				{ label: tr('utilities.gpu.webgpu.maxTextureDimension2D'), value: `${limits.maxTextureDimension2D}` },
				{ label: tr('utilities.gpu.webgpu.maxBufferSize'), value: `${limits.maxBufferSize}` },
				{ label: tr('utilities.gpu.webgpu.maxComputeWorkgroupSizeX'), value: `${limits.maxComputeWorkgroupSizeX}` },
				{ label: tr('utilities.gpu.webgpu.maxBindGroups'), value: `${limits.maxBindGroups}` }
			];
			webgpuFeatures = [...adapter.features].sort();
			webgpuState = 'ok';
		} catch {
			webgpuState = 'noAdapter';
		}
	}

	/* ---------------------------------------------------------------------- */
	/* Benchmark: fullscreen-quad fill-rate at increasing overdraw, then an   */
	/* instanced-triangle throughput pass. Button-started, ~5s, rAF-driven.   */
	/* ---------------------------------------------------------------------- */

	const BENCH_SIZE = 1024;
	const OVERDRAW_LAYERS = [1, 4, 16] as const;
	const FILLRATE_MS_PER_LAYER = 1200;
	const TRIANGLE_MS = 1400;
	const TRIANGLE_INSTANCES = 20000;

	interface FillResult {
		layers: number;
		mpixelsPerSec: number;
		fps: number;
	}

	let benchRunning = $state(false);
	let benchAvailable = $state(true);
	let fillResults = $state<FillResult[]>([]);
	let triangleResult = $state<{ trisPerSec: number } | null>(null);
	let benchStopped = $state(false);

	const FILL_VS = `
		attribute vec2 aPos;
		void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
	`;
	const FILL_FS = `
		precision mediump float;
		uniform vec3 uColor;
		void main() { gl_FragColor = vec4(uColor, 1.0); }
	`;
	const TRI_VS = `
		attribute vec2 aPos;
		attribute vec2 aOffset;
		void main() {
			vec2 p = aPos * 0.02 + aOffset;
			gl_Position = vec4(p, 0.0, 1.0);
		}
	`;
	const TRI_FS = `
		precision lowp float;
		void main() { gl_FragColor = vec4(0.38, 0.75, 0.47, 1.0); }
	`;

	function compileProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
		const vs = gl.createShader(gl.VERTEX_SHADER)!;
		gl.shaderSource(vs, vsSrc);
		gl.compileShader(vs);
		const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
		gl.shaderSource(fs, fsSrc);
		gl.compileShader(fs);
		const prog = gl.createProgram()!;
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
		return prog;
	}

	function isHidden(): boolean {
		return typeof document !== 'undefined' && document.hidden;
	}

	async function runBenchmark() {
		if (benchRunning) return;
		playSound('click');
		fillResults = [];
		triangleResult = null;
		benchStopped = false;

		const canvas = document.createElement('canvas');
		canvas.width = BENCH_SIZE;
		canvas.height = BENCH_SIZE;
		const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
		if (!gl) {
			benchAvailable = false;
			return;
		}
		benchRunning = true;
		gl.viewport(0, 0, BENCH_SIZE, BENCH_SIZE);

		try {
			// --- Fill-rate pass: draw N full-screen quads per frame, timed. ---
			const fillProg = compileProgram(gl, FILL_VS, FILL_FS);
			if (fillProg) {
				const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);
				const buf = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, buf);
				gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
				const aPos = gl.getAttribLocation(fillProg, 'aPos');
				const uColor = gl.getUniformLocation(fillProg, 'uColor');
				gl.useProgram(fillProg);
				gl.enableVertexAttribArray(aPos);
				gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

				for (const layers of OVERDRAW_LAYERS) {
					if (benchStopped || isHidden()) break;
					let frames = 0;
					const start = performance.now();
					const end = start + FILLRATE_MS_PER_LAYER;
					await new Promise<void>((resolve) => {
						const frame = () => {
							if (benchStopped || isHidden() || performance.now() >= end) {
								resolve();
								return;
							}
							gl.clear(gl.COLOR_BUFFER_BIT);
							for (let i = 0; i < layers; i++) {
								gl.uniform3f(uColor!, 0.05, 0.05, 0.05);
								gl.drawArrays(gl.TRIANGLES, 0, 6);
							}
							frames++;
							requestAnimationFrame(frame);
						};
						requestAnimationFrame(frame);
					});
					const elapsedSec = (performance.now() - start) / 1000;
					const fps = frames / elapsedSec;
					const pixelsPerFrame = BENCH_SIZE * BENCH_SIZE * layers;
					const mpixelsPerSec = (pixelsPerFrame * frames) / elapsedSec / 1_000_000;
					fillResults = [...fillResults, { layers, mpixelsPerSec: Math.round(mpixelsPerSec), fps: Math.round(fps * 10) / 10 }];
				}
				gl.disable(gl.BLEND);
			}

			// --- Triangle-throughput pass: instanced draw via ANGLE_instanced_arrays. ---
			if (!benchStopped && !isHidden()) {
				const triProg = compileProgram(gl, TRI_VS, TRI_FS);
				const inst = gl.getExtension('ANGLE_instanced_arrays');
				if (triProg && inst) {
					const tri = new Float32Array([0, 0.5, -0.5, -0.5, 0.5, -0.5]);
					const triBuf = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
					gl.bufferData(gl.ARRAY_BUFFER, tri, gl.STATIC_DRAW);

					const offsets = new Float32Array(TRIANGLE_INSTANCES * 2);
					for (let i = 0; i < TRIANGLE_INSTANCES; i++) {
						offsets[i * 2] = Math.random() * 2 - 1;
						offsets[i * 2 + 1] = Math.random() * 2 - 1;
					}
					const offBuf = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, offBuf);
					gl.bufferData(gl.ARRAY_BUFFER, offsets, gl.STATIC_DRAW);

					gl.useProgram(triProg);
					const aPos = gl.getAttribLocation(triProg, 'aPos');
					const aOffset = gl.getAttribLocation(triProg, 'aOffset');
					gl.bindBuffer(gl.ARRAY_BUFFER, triBuf);
					gl.enableVertexAttribArray(aPos);
					gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
					gl.bindBuffer(gl.ARRAY_BUFFER, offBuf);
					gl.enableVertexAttribArray(aOffset);
					gl.vertexAttribPointer(aOffset, 2, gl.FLOAT, false, 0, 0);
					inst.vertexAttribDivisorANGLE(aOffset, 1);

					let draws = 0;
					const start = performance.now();
					const end = start + TRIANGLE_MS;
					await new Promise<void>((resolve) => {
						const frame = () => {
							if (benchStopped || isHidden() || performance.now() >= end) {
								resolve();
								return;
							}
							gl.clear(gl.COLOR_BUFFER_BIT);
							inst.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 3, TRIANGLE_INSTANCES);
							draws++;
							requestAnimationFrame(frame);
						};
						requestAnimationFrame(frame);
					});
					const elapsedSec = (performance.now() - start) / 1000;
					const trisPerSec = (draws * TRIANGLE_INSTANCES) / elapsedSec;
					triangleResult = { trisPerSec: Math.round(trisPerSec) };
				}
			}
		} finally {
			const lose = gl.getExtension('WEBGL_lose_context');
			lose?.loseContext();
			benchRunning = false;
		}
	}

	function stopBenchmark() {
		benchStopped = true;
	}

	function onVisibilityChange() {
		if (document.hidden && benchRunning) {
			// The rAF loops themselves check isHidden() each frame, so this just
			// flips the flag; the running loop notices on its next frame.
			benchStopped = true;
		}
	}

	function formatCompact(n: number): string {
		if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
		return `${n}`;
	}

	readWebgl();
	void readWebgpu();

	document.addEventListener('visibilitychange', onVisibilityChange);
	onDestroy(() => {
		benchStopped = true;
		document.removeEventListener('visibilitychange', onVisibilityChange);
	});
</script>

<div class="space-y-3 min-w-0">
	<!-- WebGL -->
	<div class="border rounded-xs bg-black/25 p-2.5 border-[#61afef]/20 min-w-0">
		<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
			<span class="text-xs font-black font-mono" style="color: #61afef">{$t('utilities.gpu.section.webgl')}</span>
		</div>
		{#if !webglAvailable}
			<div class="text-xs font-mono text-[#e06c75]">{$t('utilities.gpu.webgl.unavailable')}</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
				{#each webglRows as row (row.label)}
					<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex items-baseline justify-between gap-2 min-w-0" title={row.title}>
						<span class="text-[10px] font-mono font-bold text-white/60 uppercase shrink-0">{row.label}</span>
						<span class="text-xs font-mono font-bold text-[#d8dee9] truncate" title={row.value}>{row.value}</span>
					</div>
				{/each}
			</div>
			<button
				onclick={() => (webglExtensionsOpen = !webglExtensionsOpen)}
				class="press mt-1.5 px-2 py-1 border border-white/15 text-white/60 rounded-xs text-[10px] font-bold cursor-pointer hover:bg-white/10 transition-colors"
			>
				{$t('utilities.gpu.webgl.extensions', { count: webglExtensions.length })} — {webglExtensionsOpen ? $t('utilities.gpu.webgl.extensions.hide') : $t('utilities.gpu.webgl.extensions.show')}
			</button>
			{#if webglExtensionsOpen}
				<div class="mt-1.5 flex flex-wrap gap-1">
					{#each webglExtensions as ext (ext)}
						<span class="px-1.5 py-0.5 border border-white/10 bg-black/40 rounded-xs text-[10px] font-mono text-white/55 truncate max-w-full">{ext}</span>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- WebGPU -->
	<div class="border rounded-xs bg-black/25 p-2.5 border-[#c678dd]/20 min-w-0">
		<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
			<span class="text-xs font-black font-mono" style="color: #c678dd">{$t('utilities.gpu.section.webgpu')}</span>
		</div>
		{#if webgpuState === 'unavailable'}
			<div class="text-xs font-mono text-[#e5c07b]">{$t('utilities.gpu.webgpu.unavailable')}</div>
		{:else if webgpuState === 'noAdapter'}
			<div class="text-xs font-mono text-[#e5c07b]">{$t('utilities.gpu.webgpu.noAdapter')}</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
				{#each webgpuRows as row (row.label)}
					<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex items-baseline justify-between gap-2 min-w-0">
						<span class="text-[10px] font-mono font-bold text-white/60 uppercase shrink-0">{row.label}</span>
						<span class="text-xs font-mono font-bold text-[#d8dee9] truncate" title={row.value}>{row.value}</span>
					</div>
				{/each}
			</div>
			<button
				onclick={() => (webgpuFeaturesOpen = !webgpuFeaturesOpen)}
				class="press mt-1.5 px-2 py-1 border border-white/15 text-white/60 rounded-xs text-[10px] font-bold cursor-pointer hover:bg-white/10 transition-colors"
			>
				{$t('utilities.gpu.webgpu.features', { count: webgpuFeatures.length })} — {webgpuFeaturesOpen ? $t('utilities.gpu.webgpu.features.hide') : $t('utilities.gpu.webgpu.features.show')}
			</button>
			{#if webgpuFeaturesOpen}
				<div class="mt-1.5 flex flex-wrap gap-1">
					{#each webgpuFeatures as feat (feat)}
						<span class="px-1.5 py-0.5 border border-white/10 bg-black/40 rounded-xs text-[10px] font-mono text-white/55 truncate max-w-full">{feat}</span>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Benchmark -->
	<div class="border rounded-xs bg-black/25 p-2.5 border-[#98c379]/20 min-w-0">
		<div class="flex items-baseline justify-between gap-2 border-b border-white/10 pb-1 mb-1.5">
			<span class="text-xs font-black font-mono" style="color: #98c379">{$t('utilities.gpu.section.benchmark')}</span>
		</div>
		<div class="text-[11px] font-mono text-white/60 leading-relaxed mb-2">{$t('utilities.gpu.benchmark.hint')}</div>
		{#if !benchAvailable}
			<div class="text-xs font-mono text-[#e06c75]">{$t('utilities.gpu.benchmark.unavailable')}</div>
		{:else}
			<div class="flex flex-wrap items-center gap-2 mb-2">
				{#if !benchRunning}
					<button
						onclick={runBenchmark}
						class="press px-2.5 py-1.5 border border-[#98c379]/50 text-[#98c379] rounded-xs text-xs font-bold cursor-pointer hover:bg-white/10 transition-colors"
					>
						{$t('utilities.gpu.benchmark.start')}
					</button>
				{:else}
					<button
						onclick={stopBenchmark}
						class="press px-2.5 py-1.5 border border-[#e06c75] text-[#e06c75] rounded-xs text-xs font-black cursor-pointer hover:bg-[#e06c75] hover:text-black transition-colors"
					>
						{$t('utilities.speed.stop')}
					</button>
					<span class="text-xs font-mono text-[#e5c07b] flex items-center gap-1.5">
						<span class="w-1.5 h-1.5 rounded-full bg-[#e5c07b] blink-live shrink-0"></span>
						{$t('utilities.gpu.benchmark.running')}
					</span>
				{/if}
			</div>
			{#if fillResults.length}
				<div class="text-[10px] font-mono font-bold text-white/60 uppercase mb-1">{$t('utilities.gpu.benchmark.fillrate')}</div>
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-1.5 mb-2">
					{#each fillResults as r (r.layers)}
						<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex flex-col gap-0.5 min-w-0">
							<span class="text-[10px] font-mono font-bold text-white/60 truncate">{$t('utilities.gpu.benchmark.fillrate.layers', { layers: r.layers })}</span>
							<span class="text-xs font-mono font-bold text-[#98c379] truncate">{$t('utilities.gpu.benchmark.fillrate.mpixels', { mpixels: r.mpixelsPerSec })}</span>
							<span class="text-[10px] font-mono text-white/60 truncate">{$t('utilities.gpu.benchmark.fillrate.fps', { fps: r.fps })}</span>
						</div>
					{/each}
				</div>
			{/if}
			{#if triangleResult}
				<div class="text-[10px] font-mono font-bold text-white/60 uppercase mb-1">{$t('utilities.gpu.benchmark.triangles')}</div>
				<div class="border border-white/10 bg-black/40 rounded-xs px-2.5 py-1.5 flex items-baseline justify-between gap-2 min-w-0">
					<span class="text-[10px] font-mono text-white/60 truncate">{$t('utilities.gpu.benchmark.triangles.count', { count: TRIANGLE_INSTANCES.toLocaleString() })}</span>
					<span class="text-xs font-mono font-bold text-[#98c379] truncate">{$t('utilities.gpu.benchmark.triangles.value', { value: formatCompact(triangleResult.trisPerSec) })}</span>
				</div>
			{/if}
		{/if}
	</div>
</div>
