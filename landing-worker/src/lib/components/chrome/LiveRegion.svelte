<script lang="ts">
	import { announcement } from '$lib/stores/a11y';

	/* Two regions, one per politeness, both permanently in the DOM: a screen
	   reader only watches a live region that existed before its text changed,
	   so creating one on demand is read as nothing. The text is cleared a
	   moment after it lands (the reader has already queued it) so the next
	   announcement is always a change even when it is the same sentence. */
	let polite = $state('');
	let assertive = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		const a = $announcement;
		if (!a) return;
		if (a.priority === 'assertive') assertive = a.text;
		else polite = a.text;
		clearTimeout(timer);
		timer = setTimeout(() => {
			polite = '';
			assertive = '';
		}, 1500);
		return () => clearTimeout(timer);
	});
</script>

<div class="sr-only" aria-live="polite" aria-atomic="true">{polite}</div>
<div class="sr-only" aria-live="assertive" aria-atomic="true">{assertive}</div>
