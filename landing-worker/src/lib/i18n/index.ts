import { writable, derived, get } from 'svelte/store';
import { MESSAGES } from './messages';

/**
 * Site-wide language.
 *
 * The site is prerendered, so the server cannot read Accept-Language: every
 * page ships in English and the client re-resolves at init, before any child
 * view mounts. The choice lives in localStorage; "auto" follows the browser.
 *
 * Text goes through one of three doors:
 *   - `$t('key')` in templates and $derived expressions (reactive);
 *   - `tr('key')` in plain .ts modules, resolved at call time (not reactive);
 *   - `localized({ en, 'zh-CN', ... })` for a value that is not a string
 *     (an array of lines, a nested object).
 * A missing translation falls back to English, then to the key itself, so a
 * half-translated locale never shows a blank.
 */
export type Locale = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ko';

export const LOCALES: readonly { id: Locale; /** Short badge for the footer button. */ code: string; /** Its own name, never translated. */ native: string }[] = [
	{ id: 'en', code: 'EN', native: 'English (UK)' },
	{ id: 'zh-CN', code: '简', native: '简体中文' },
	{ id: 'zh-TW', code: '繁', native: '繁體中文' },
	{ id: 'ja', code: '日', native: '日本語' },
	{ id: 'ko', code: '한', native: '한국어' }
];
export const LOCALE_IDS: readonly Locale[] = LOCALES.map((l) => l.id);
export const DEFAULT_LOCALE: Locale = 'en';

const KEY = 'krsz.locale';

/** The locale the site renders in. */
export const locale = writable<Locale>(DEFAULT_LOCALE);
/** Whether that value follows the browser rather than a choice. */
export const localeAuto = writable<boolean>(true);

/** Map one BCP 47 tag onto a supported locale, or null if it is none of ours. */
function matchTag(tag: string): Locale | null {
	const t = tag.toLowerCase();
	if (t.startsWith('zh')) {
		// Traditional: explicit script, or the regions that write it.
		if (/hant|-tw|-hk|-mo/.test(t)) return 'zh-TW';
		return 'zh-CN';
	}
	if (t.startsWith('ja')) return 'ja';
	if (t.startsWith('ko')) return 'ko';
	if (t.startsWith('en')) return 'en';
	return null;
}

/** What the browser asks for, first supported language wins. */
export function detectLocale(): Locale {
	if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
	const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
	for (const tag of tags) {
		const m = tag && matchTag(tag);
		if (m) return m;
	}
	return DEFAULT_LOCALE;
}

function isLocale(v: unknown): v is Locale {
	return typeof v === 'string' && (LOCALE_IDS as readonly string[]).includes(v);
}

/** Read the stored choice (or detect), synchronously -- call before children mount. */
export function initLocale(): void {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(KEY);
	} catch {
		/* private mode -- fall through to auto */
	}
	if (isLocale(stored)) {
		localeAuto.set(false);
		locale.set(stored);
	} else {
		localeAuto.set(true);
		locale.set(detectLocale());
	}
	applyLang(get(locale));
}

export function setLocale(next: Locale | 'auto'): void {
	if (next === 'auto') {
		localeAuto.set(true);
		locale.set(detectLocale());
	} else {
		localeAuto.set(false);
		locale.set(next);
	}
	applyLang(get(locale));
	try {
		localStorage.setItem(KEY, next);
	} catch {
		/* private mode -- the setting still holds for this visit */
	}
}

/** BCP 47 tag for <html lang>, where our locale id isn't already one. The
 *  site's English is British, so 'en' is published as 'en-GB'. */
const HTML_LANG: Partial<Record<Locale, string>> = { en: 'en-GB' };

function applyLang(l: Locale): void {
	if (typeof document !== 'undefined') document.documentElement.lang = HTML_LANG[l] ?? l;
}

/* ---- messages ---------------------------------------------------------- */

export type Vars = Record<string, string | number>;

function interpolate(s: string, vars?: Vars): string {
	if (!vars) return s;
	return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function lookup(l: Locale, key: string): string | undefined {
	return MESSAGES[l]?.[key] ?? MESSAGES.en[key];
}

/** Translate `key` for locale `l`. Falls back to English, then the key. */
export function translate(l: Locale, key: string, vars?: Vars): string {
	const s = lookup(l, key);
	if (s === undefined) {
		if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
		return key;
	}
	return interpolate(s, vars);
}

/** Reactive: `{$t('chrome.footer.credits')}` re-renders when the locale changes. */
export const t = derived(locale, (l) => (key: string, vars?: Vars) => translate(l, key, vars));

/** Non-reactive, for .ts modules: resolved with the locale current at the call. */
export function tr(key: string, vars?: Vars): string {
	return translate(get(locale), key, vars);
}

/** Does the key exist in any locale? For optional strings (e.g. a hint that only some items have). */
export function has(key: string): boolean {
	return MESSAGES.en[key] !== undefined;
}

/** Pick a non-string value per locale (arrays of lines, nested tables). English is required. */
export function localized<T>(map: { en: T } & Partial<Record<Locale, T>>, l: Locale = get(locale)): T {
	return map[l] ?? map.en;
}

/** Reactive counterpart of `localized`. */
export const pick = derived(locale, (l) => <T>(map: { en: T } & Partial<Record<Locale, T>>) => localized(map, l));

/** Intl locale tag for dates/numbers -- the site's own tag, not the browser's. */
export const intlTag = derived(locale, (l) => l);
