import { describe, it, expect, vi } from 'vitest';
import { TAB_ROUTES, ISOLATED_ROUTES, tabIndexFromPath, navigateTo } from '../../src/lib/routes-map';

describe('tabIndexFromPath', () => {
	it('maps every listed route to its own index', () => {
		TAB_ROUTES.forEach((route, i) => {
			expect(tabIndexFromPath(route)).toBe(i);
		});
	});

	it('maps the site root to the first tab', () => {
		expect(tabIndexFromPath('/')).toBe(0);
		expect(tabIndexFromPath('')).toBe(0);
	});

	it('falls back to the first tab for an unknown path', () => {
		expect(tabIndexFromPath('/nope')).toBe(0);
		expect(tabIndexFromPath('/synth/extra')).toBe(0);
	});

	it('ignores case', () => {
		expect(tabIndexFromPath('/SYNTH')).toBe(TAB_ROUTES.indexOf('/synth'));
	});

	it('ignores surrounding slashes', () => {
		const i = TAB_ROUTES.indexOf('/utils');
		expect(tabIndexFromPath('utils')).toBe(i);
		expect(tabIndexFromPath('/utils/')).toBe(i);
		expect(tabIndexFromPath('//utils//')).toBe(i);
	});
});

describe('navigateTo', () => {
	it('uses the client-side callback for an ordinary route', () => {
		const spa = vi.fn();
		navigateTo('/synth', spa);
		expect(spa).toHaveBeenCalledWith('/synth');
	});

	it('forces a document load for an isolated route', () => {
		// /krsz-vm needs COOP/COEP, which only a real navigation applies.
		const assign = vi.fn();
		vi.stubGlobal('location', { pathname: '/synth', assign });
		try {
			const spa = vi.fn();
			navigateTo('/krsz-vm', spa);
			expect(assign).toHaveBeenCalledWith('/krsz-vm');
			expect(spa).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('stays client-side when already on the isolated route', () => {
		// the document is already isolated, so no reload is needed
		const assign = vi.fn();
		vi.stubGlobal('location', { pathname: '/krsz-vm', assign });
		try {
			const spa = vi.fn();
			navigateTo('/krsz-vm', spa);
			expect(assign).not.toHaveBeenCalled();
			expect(spa).toHaveBeenCalledWith('/krsz-vm');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('lists /krsz-vm as isolated', () => {
		expect(ISOLATED_ROUTES).toContain('/krsz-vm');
	});

	it('treats every isolated route as a real tab', () => {
		for (const route of ISOLATED_ROUTES) expect(TAB_ROUTES).toContain(route);
	});
});
