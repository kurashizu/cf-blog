// Prerender every route — the page is fully static, with a tiny client
// script for the timezone/year/cursor interactions. Cloudflare serves
// the prerendered HTML straight from the assets binding; the worker
// is only invoked for unmatched routes (e.g. the 404).
export const prerender = true;
