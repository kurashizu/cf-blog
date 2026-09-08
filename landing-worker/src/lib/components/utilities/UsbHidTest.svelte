<script lang="ts">
	import { onDestroy } from 'svelte';
	import { playSound } from '../../sound';
	import { t } from '$lib/i18n';

	/* WebUSB / WebHID / Web Serial have no types in lib.dom.d.ts (they are not
	   part of the standard DOM lib TypeScript ships), so the shapes used here
	   are declared locally -- just enough surface for what this page reads,
	   not full ambient globals that would leak into other files. */

	interface UsbConfigInterface {
		interfaceClass: number;
		interfaceSubclass: number;
		interfaceProtocol: number;
	}
	interface UsbConfiguration {
		interfaces: { alternates: UsbConfigInterface[] }[];
	}
	interface UsbDevice {
		vendorId: number;
		productId: number;
		manufacturerName?: string;
		productName?: string;
		serialNumber?: string;
		deviceVersionMajor: number;
		deviceVersionMinor: number;
		deviceClass: number;
		deviceSubclass: number;
		deviceProtocol: number;
		configurations: UsbConfiguration[];
	}
	interface UsbApi {
		getDevices(): Promise<UsbDevice[]>;
		requestDevice(options: { filters: unknown[] }): Promise<UsbDevice>;
		addEventListener(type: 'connect' | 'disconnect', listener: () => void): void;
		removeEventListener(type: 'connect' | 'disconnect', listener: () => void): void;
	}

	interface HidCollection {
		usagePage?: number;
		usage?: number;
		inputReports?: unknown[];
		outputReports?: unknown[];
		featureReports?: unknown[];
	}
	interface HidInputReportEvent {
		device: HidDevice;
		reportId: number;
		data: DataView;
	}
	interface HidDevice {
		vendorId: number;
		productId: number;
		productName?: string;
		opened: boolean;
		collections: HidCollection[];
		open(): Promise<void>;
		close(): Promise<void>;
		oninputreport: ((ev: HidInputReportEvent) => void) | null;
	}
	interface HidApi {
		getDevices(): Promise<HidDevice[]>;
		requestDevice(options: { filters: unknown[] }): Promise<HidDevice[]>;
		addEventListener(type: 'connect' | 'disconnect', listener: () => void): void;
		removeEventListener(type: 'connect' | 'disconnect', listener: () => void): void;
	}

	interface SerialPortInfo {
		usbVendorId?: number;
		usbProductId?: number;
	}
	interface SerialPort {
		getInfo(): SerialPortInfo;
	}
	interface SerialApi {
		getPorts(): Promise<SerialPort[]>;
		requestPort(): Promise<SerialPort>;
		addEventListener(type: 'connect' | 'disconnect', listener: () => void): void;
		removeEventListener(type: 'connect' | 'disconnect', listener: () => void): void;
	}

	const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { usb?: UsbApi; hid?: HidApi; serial?: SerialApi }) : undefined;

	const usbApi = nav?.usb ?? null;
	const hidApi = nav?.hid ?? null;
	const serialApi = nav?.serial ?? null;

	// generic-desktop (0x01) and consumer (0x0C) usage names worth spelling out.
	const USAGE_PAGE_NAMES: Record<number, string> = { 0x01: 'generic-desktop', 0x0c: 'consumer', 0x02: 'simulation', 0x07: 'keyboard', 0x08: 'led', 0x09: 'button' };
	const GENERIC_DESKTOP_USAGE: Record<number, string> = { 0x01: 'pointer', 0x02: 'mouse', 0x04: 'joystick', 0x05: 'gamepad', 0x06: 'keyboard', 0x07: 'keypad', 0x08: 'multi-axis', 0x80: 'system control' };
	const CONSUMER_USAGE: Record<number, string> = { 0x01: 'consumer control', 0xb5: 'scan next track', 0xb6: 'scan previous track', 0xcd: 'play/pause', 0xe2: 'mute', 0xe9: 'volume up', 0xea: 'volume down' };

	function usagePageName(page: number | undefined): string {
		if (page === undefined) return 'n/a';
		const known = USAGE_PAGE_NAMES[page];
		return known ? `0x${page.toString(16).padStart(2, '0')} (${known})` : `0x${page.toString(16).padStart(2, '0')}`;
	}
	function usageName(page: number | undefined, usage: number | undefined): string {
		if (usage === undefined) return 'n/a';
		const table = page === 0x01 ? GENERIC_DESKTOP_USAGE : page === 0x0c ? CONSUMER_USAGE : null;
		const known = table?.[usage];
		return known ? `0x${usage.toString(16).padStart(2, '0')} (${known})` : `0x${usage.toString(16).padStart(2, '0')}`;
	}
	function hexId(n: number | undefined): string {
		return n === undefined ? 'n/a' : `0x${n.toString(16).padStart(4, '0')}`;
	}

	let usbDevices = $state<UsbDevice[]>([]);
	let hidDevices = $state<HidDevice[]>([]);
	let serialPorts = $state<SerialPort[]>([]);

	async function refreshUsb() {
		if (!usbApi) return;
		usbDevices = await usbApi.getDevices();
	}
	async function refreshHid() {
		if (!hidApi) return;
		hidDevices = await hidApi.getDevices();
	}
	async function refreshSerial() {
		if (!serialApi) return;
		serialPorts = await serialApi.getPorts();
	}

	async function pickUsb() {
		if (!usbApi) return;
		playSound('click');
		try {
			await usbApi.requestDevice({ filters: [] });
			await refreshUsb();
		} catch {
			// user cancelled the chooser
		}
	}
	async function pickHid() {
		if (!hidApi) return;
		playSound('click');
		try {
			await hidApi.requestDevice({ filters: [] });
			await refreshHid();
		} catch {
			// user cancelled the chooser
		}
	}
	async function pickSerial() {
		if (!serialApi) return;
		playSound('click');
		try {
			await serialApi.requestPort();
			await refreshSerial();
		} catch {
			// user cancelled the chooser
		}
	}

	// HID input-report monitor: one device open at a time to keep this simple and safe to clean up.
	let monitoringDevice: HidDevice | null = null;
	let monitorHex = $state('');
	let monitorReportId = $state<number | null>(null);
	let monitorRate = $state(0);
	let monitorCount = 0;
	let monitorRateTimer: ReturnType<typeof setInterval> | null = null;
	let monitoringId = $state<string | null>(null);

	function deviceKey(d: HidDevice): string {
		return `${d.vendorId}:${d.productId}:${d.productName ?? ''}`;
	}

	async function toggleMonitor(d: HidDevice) {
		playSound('click');
		if (monitoringDevice === d) {
			await stopMonitor();
			return;
		}
		await stopMonitor();
		try {
			if (!d.opened) await d.open();
			d.oninputreport = (ev) => {
				monitorCount++;
				monitorReportId = ev.reportId;
				const bytes: string[] = [];
				for (let i = 0; i < Math.min(16, ev.data.byteLength); i++) {
					bytes.push(ev.data.getUint8(i).toString(16).padStart(2, '0'));
				}
				monitorHex = bytes.join(' ');
			};
			monitoringDevice = d;
			monitoringId = deviceKey(d);
			monitorCount = 0;
			monitorRateTimer = setInterval(() => {
				monitorRate = monitorCount;
				monitorCount = 0;
			}, 1000);
		} catch {
			monitoringDevice = null;
			monitoringId = null;
		}
	}

	async function stopMonitor() {
		if (monitorRateTimer) {
			clearInterval(monitorRateTimer);
			monitorRateTimer = null;
		}
		if (monitoringDevice) {
			monitoringDevice.oninputreport = null;
			try {
				await monitoringDevice.close();
			} catch {
				// best-effort
			}
		}
		monitoringDevice = null;
		monitoringId = null;
		monitorHex = '';
		monitorReportId = null;
		monitorRate = 0;
	}

	function onHotplug() {
		refreshUsb();
		refreshHid();
		refreshSerial();
	}

	refreshUsb();
	refreshHid();
	refreshSerial();

	usbApi?.addEventListener('connect', onHotplug);
	usbApi?.addEventListener('disconnect', onHotplug);
	hidApi?.addEventListener('connect', onHotplug);
	hidApi?.addEventListener('disconnect', onHotplug);
	serialApi?.addEventListener('connect', onHotplug);
	serialApi?.addEventListener('disconnect', onHotplug);

	onDestroy(() => {
		stopMonitor();
		usbApi?.removeEventListener('connect', onHotplug);
		usbApi?.removeEventListener('disconnect', onHotplug);
		hidApi?.removeEventListener('connect', onHotplug);
		hidApi?.removeEventListener('disconnect', onHotplug);
		serialApi?.removeEventListener('connect', onHotplug);
		serialApi?.removeEventListener('disconnect', onHotplug);
	});
</script>

<div class="space-y-2">
	<!-- WebUSB -->
	<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1.5 min-w-0">
		<div class="flex items-center justify-between gap-2">
			<div class="text-[10px] font-mono font-bold text-white/60 uppercase">{$t('utilities.usb.section.usb')}</div>
			{#if usbApi}
				<button onclick={pickUsb} class="press px-2 py-1 border border-[#56b6c2]/50 text-[#56b6c2] hover:bg-[#56b6c2]/20 rounded-xs font-bold text-[10px] cursor-pointer transition-colors">
					{$t('utilities.usb.pickDevice')}
				</button>
			{/if}
		</div>
		{#if !usbApi}
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.usb.notAvailable')}</div>
		{:else if usbDevices.length === 0}
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.usb.noDevices')}</div>
		{:else}
			<div class="space-y-1.5">
				{#each usbDevices as d, i (i)}
					<div class="border border-white/10 bg-black/30 rounded-xs p-1.5 text-[10px] font-mono space-y-0.5 min-w-0">
						<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
							<span class="font-bold text-[#56b6c2]">{hexId(d.vendorId)}:{hexId(d.productId)}</span>
							<span class="text-white/70 truncate">{d.productName || 'n/a'}</span>
							<span class="text-white/50 truncate">{d.manufacturerName || 'n/a'}</span>
						</div>
						<div class="flex flex-wrap gap-x-3 gap-y-0.5 text-white/60">
							<span>{$t('utilities.usb.serial')}: {d.serialNumber ? $t('utilities.usb.serial.yes') : $t('utilities.usb.serial.no')}</span>
							<span>{$t('utilities.usb.usbVersion')}: {d.deviceVersionMajor}.{d.deviceVersionMinor}</span>
							<span>{$t('utilities.usb.deviceClass')}: 0x{d.deviceClass.toString(16).padStart(2, '0')}/0x{d.deviceSubclass.toString(16).padStart(2, '0')}/0x{d.deviceProtocol.toString(16).padStart(2, '0')}</span>
							<span>{$t('utilities.usb.configs', { count: d.configurations.length })}</span>
						</div>
						{#each d.configurations as cfg, ci (ci)}
							<div class="text-white/50 pl-2">
								{$t('utilities.usb.interfaces', { count: cfg.interfaces.length })}:
								{cfg.interfaces.map((iface) => `0x${(iface.alternates[0]?.interfaceClass ?? 0).toString(16).padStart(2, '0')}`).join(', ')}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- WebHID -->
	<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1.5 min-w-0">
		<div class="flex items-center justify-between gap-2">
			<div class="text-[10px] font-mono font-bold text-white/60 uppercase">{$t('utilities.usb.section.hid')}</div>
			{#if hidApi}
				<button onclick={pickHid} class="press px-2 py-1 border border-[#98c379]/50 text-[#98c379] hover:bg-[#98c379]/20 rounded-xs font-bold text-[10px] cursor-pointer transition-colors">
					{$t('utilities.usb.pickDevice')}
				</button>
			{/if}
		</div>
		{#if !hidApi}
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.usb.notAvailable')}</div>
		{:else}
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.usb.hid.protectedHint')}</div>
			{#if hidDevices.length === 0}
				<div class="text-[10px] font-mono text-white/50">{$t('utilities.usb.noDevices')}</div>
			{:else}
				<div class="space-y-1.5">
					{#each hidDevices as d, i (i)}
						<div class="border border-white/10 bg-black/30 rounded-xs p-1.5 text-[10px] font-mono space-y-0.5 min-w-0">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
								<span class="font-bold text-[#98c379]">{hexId(d.vendorId)}:{hexId(d.productId)}</span>
								<span class="text-white/70 truncate">{d.productName || 'n/a'}</span>
								<button onclick={() => toggleMonitor(d)} class="press ml-auto px-1.5 py-0.5 border rounded-xs font-bold text-[9px] cursor-pointer transition-colors {monitoringId === deviceKey(d) ? 'border-[#e06c75]/60 text-[#e06c75]' : 'border-white/20 text-white/50 hover:border-white/40'}">
									{monitoringId === deviceKey(d) ? $t('utilities.usb.hid.stopMonitor') : $t('utilities.usb.hid.monitor')}
								</button>
							</div>
							<div class="text-white/60">
								{#each d.collections as c, ci (ci)}
									<div>{$t('utilities.usb.hid.collection', { usagePage: usagePageName(c.usagePage), usage: usageName(c.usagePage, c.usage), inputs: c.inputReports?.length ?? 0, outputs: c.outputReports?.length ?? 0, features: c.featureReports?.length ?? 0 })}</div>
								{/each}
							</div>
							{#if monitoringId === deviceKey(d)}
								<div class="border-t border-white/10 pt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-white/60">
									<span>{$t('utilities.usb.hid.reportId')}: {monitorReportId ?? 'n/a'}</span>
									<span class="truncate">{$t('utilities.usb.hid.bytes')}: {monitorHex || 'n/a'}</span>
									<span class="ml-auto shrink-0">{$t('utilities.usb.hid.rate', { rate: monitorRate })}</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</div>

	<!-- Web Serial -->
	<div class="border border-white/15 bg-black/40 rounded-xs p-2.5 space-y-1.5 min-w-0">
		<div class="flex items-center justify-between gap-2">
			<div class="text-[10px] font-mono font-bold text-white/60 uppercase">{$t('utilities.usb.section.serial')}</div>
			{#if serialApi}
				<button onclick={pickSerial} class="press px-2 py-1 border border-[#e5c07b]/50 text-[#e5c07b] hover:bg-[#e5c07b]/20 rounded-xs font-bold text-[10px] cursor-pointer transition-colors">
					{$t('utilities.usb.pickDevice')}
				</button>
			{/if}
		</div>
		{#if !serialApi}
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.usb.notAvailable')}</div>
		{:else if serialPorts.length === 0}
			<div class="text-[10px] font-mono text-white/50">{$t('utilities.usb.noDevices')}</div>
		{:else}
			<div class="space-y-1">
				{#each serialPorts as p, i (i)}
					{@const info = p.getInfo()}
					<div class="border border-white/10 bg-black/30 rounded-xs p-1.5 text-[10px] font-mono min-w-0">
						<span class="font-bold text-[#e5c07b]">{hexId(info.usbVendorId)}:{hexId(info.usbProductId)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
