<script lang="ts">
	import { PIXEL_ICON_PATHS, type PixelIconName } from './icons';

	let { name, size = 20, class: className = '' }: { name: PixelIconName; size?: number; class?: string } =
		$props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="currentColor"
	class="inline-block shrink-0 {className}"
	style="shape-rendering: crispEdges"
>
	<path d={PIXEL_ICON_PATHS[name]} />
</svg>
