import { describe, it, expect } from 'vitest';
import { PORT_STYLE } from '../../src/lib/components/synth/patch/port-style';
import { MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { roleOf } from '../../src/lib/stores/graph-model';

/**
 * A socket says what it carries by shape and colour together, so no two roles
 * may share both -- and, within the value family, not even one: every control
 * role is a different colour *and* a different shape.
 *
 * TIME was the cv diamond in stereo's cyan and BOOL the signal circle in cv's
 * amber, and each read as another role until you leaned in. Nothing checked,
 * because the table lived in a component comment.
 */
const CONTROL = ['cv', 'unit', 'hz', 'pitch', 'index', 'time', 'bool'] as const;

describe('every socket role is drawn its own way', () => {
	it('no two roles share both shape and colour', () => {
		const seen = new Map<string, string>();
		for (const [role, s] of Object.entries(PORT_STYLE)) {
			const key = `${s.shape}|${s.color}`;
			expect(seen.get(key), `${role} is drawn like ${seen.get(key)}`).toBeUndefined();
			seen.set(key, role);
		}
	});

	it('no two value roles share a shape, or a colour', () => {
		const shapes = CONTROL.map((r) => PORT_STYLE[r].shape);
		const colors = CONTROL.map((r) => PORT_STYLE[r].color);
		expect(new Set(shapes).size).toBe(CONTROL.length);
		expect(new Set(colors).size).toBe(CONTROL.length);
	});

	it('no value role borrows a colour from sound or execution', () => {
		const soundOrExec = new Set(
			(['exec', 'signal', 'mono', 'stereo', 'left', 'right'] as const).map(
				(r) => PORT_STYLE[r].color
			)
		);
		for (const r of CONTROL)
			expect(soundOrExec.has(PORT_STYLE[r].color), `${r} is drawn in a sound colour`).toBe(false);
	});

	it('styles every role a module actually uses', () => {
		for (const m of MODULE_SPECS)
			for (const p of [...m.inputs, ...m.outputs])
				expect(PORT_STYLE[roleOf(p)], `${m.id}.${p.id}`).toBeDefined();
	});
});
