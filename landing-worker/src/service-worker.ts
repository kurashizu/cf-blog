/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Everything the site consists of — it's fully prerendered, so caching this
// makes the whole portal (synth included) work offline.
const CACHE = `krsz-cache-${version}`;
const ASSETS = [...build, ...files, ...prerendered];

/* `build` is the hashed bundle under /_app/immutable — a given URL there names
   one exact set of bytes forever, so it is the only group that can be answered
   from cache without asking the network first. `files` (static/) and
   `prerendered` (the page HTML) both keep their paths across deploys, so their
   contents DO change under a stable URL and must not be treated that way. */
const IMMUTABLE = new Set(build);
// Membership is tested on every request the worker sees, so it is a Set rather
// than a scan of the array.
const CACHEABLE = new Set(ASSETS);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

/* Cache-first, for the hashed bundle only.
 *
 * Safe here precisely because the URL changes whenever the bytes do, so a hit
 * can never be stale. A miss is written back, which is what makes a page built
 * from a mix of new and already-cached chunks work offline afterwards. */
async function cacheFirst(request: Request, cache: Cache) {
	const cached = await cache.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	if (response.ok) cache.put(request, response.clone());
	return response;
}

/* Network-first, for everything whose URL outlives its contents.
 *
 * This is what a deploy needs. Answering page HTML from cache without asking
 * the network — which is what this worker used to do for every request — served
 * the previous build's HTML, and that HTML names the previous build's hashed
 * bundle, so the whole page came back at the old version with the old commit in
 * the footer. No amount of waiting helped, because on that path no request was
 * ever made: only a reload late enough to be controlled by the newly installed
 * worker escaped it. Going to the network first and keeping the cache as the
 * fallback keeps the offline shell working while making a deploy show up on the
 * next load. */
async function networkFirst(request: Request, cache: Cache) {
	try {
		const response = await fetch(request);
		// Only successful, complete responses are worth keeping: an opaque or
		// partial one would poison the offline fallback with something that
		// cannot be replayed.
		if (response.ok && response.type === 'basic') cache.put(request, response.clone());
		return response;
	} catch (err) {
		const cached = await cache.match(request);
		if (cached) return cached;
		// Offline navigation to a page that was never visited: the prerendered
		// shell is still a better answer than a browser error page.
		if (request.mode === 'navigate') {
			const fallback = await cache.match('/');
			if (fallback) return fallback;
		}
		throw err;
	}
}

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;
	const url = new URL(event.request.url);
	// Only handle same-origin requests — cross-origin probes/API calls must hit the network.
	if (url.origin !== location.origin) return;
	// Range requests (the VM disk images, audio scrubbing) must reach the
	// network untouched: a cache round-trip here answers with the whole entity
	// and breaks the partial-content contract the caller is relying on.
	if (event.request.headers.has('range')) return;

	/* The runtime endpoints — the DNS proxy, the network relay, the VM image and
	   model file streams — are live data wearing a same-origin URL. They were
	   being written into the cache on first response and then replayed from it
	   forever, so they are kept out of the worker entirely. Navigations stay in
	   regardless of whether the path is one of the prerendered set, because a
	   navigation is the request that needs the offline fallback most. */
	const known = CACHEABLE.has(url.pathname);
	if (!known && event.request.mode !== 'navigate') return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			return IMMUTABLE.has(url.pathname)
				? cacheFirst(event.request, cache)
				: networkFirst(event.request, cache);
		})()
	);
});
