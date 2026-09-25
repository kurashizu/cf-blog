import { describe, it, expect } from 'vitest';
import { planLoops } from '../../src/lib/audio/loop-plan';

/**
 * Which SEND/RTN loops compile into one sample-accurate processor.
 *
 * The rule is structural, so it is tested on graphs: a loop is a path from a
 * RTN to a SEND on the same bus, every module on it must be one the processor
 * knows, and loops sharing a node run together.
 */

type N = { id: string; type: string };
const c = (from: string, to: string, toPort = 'in') => ({ from, fromPort: 'out', to, toPort });

/** EXCT -> SUM -> DELAY -> SEND, RTN -> GAIN -> SUM: the comb every test here starts from. */
function comb(extra: N[] = [], bus = 0) {
	const nodes: N[] = [
		{ id: 'e', type: 'excite' },
		{ id: 'sum', type: 'sum' },
		{ id: 'd', type: 'delay' },
		{ id: 's', type: 'fbsend' },
		{ id: 'r', type: 'fbrtn' },
		{ id: 'fb', type: 'gain' },
		{ id: 'o', type: 'out' },
		...extra
	];
	const cables = [
		c('e', 'sum'),
		c('sum', 'd'),
		c('d', 's'),
		c('r', 'fb'),
		c('fb', 'sum'),
		c('d', 'o')
	];
	return { nodes, cables, bus: (id: string) => (id === 's' || id === 'r' ? bus : 0) };
}

describe('planLoops', () => {
	it('compiles a comb, and leaves out what only feeds it or listens to it', () => {
		const g = comb();
		const [isl, ...rest] = planLoops(g.nodes, g.cables, g.bus);
		expect(rest).toEqual([]);
		expect(new Set(isl.members)).toEqual(new Set(['r', 'fb', 'sum', 'd', 's']));
		// The strike and OUT are outside: an input channel and an output tap.
		expect(isl.members).not.toContain('e');
		expect(isl.members).not.toContain('o');
	});

	it('orders the loop so everything comes after what feeds it', () => {
		const g = comb();
		const [isl] = planLoops(g.nodes, g.cables, g.bus);
		const at = (id: string) => isl.members.indexOf(id);
		expect(at('r')).toBeLessThan(at('fb'));
		expect(at('fb')).toBeLessThan(at('sum'));
		expect(at('sum')).toBeLessThan(at('d'));
		expect(at('d')).toBeLessThan(at('s'));
	});

	it("has the loop's first DELAY give back the sample RTN adds", () => {
		const g = comb([{ id: 'd2', type: 'delay' }]);
		g.cables = g.cables.filter((x) => !(x.from === 'd' && x.to === 's'));
		g.cables.push(c('d', 'd2'), c('d2', 's'));
		const [isl] = planLoops(g.nodes, g.cables, g.bus);
		expect([...isl.lenders]).toEqual(['d']);
	});

	it('does not compile an open SEND to RTN, which is a delay line and not a loop', () => {
		const nodes: N[] = [
			{ id: 'osc', type: 'osc' },
			{ id: 's', type: 'fbsend' },
			{ id: 'r', type: 'fbrtn' },
			{ id: 'g', type: 'gain' }
		];
		expect(planLoops(nodes, [c('osc', 's'), c('r', 'g')], () => 0)).toEqual([]);
	});

	it('leaves a loop through a module it does not know block-delayed', () => {
		const g = comb([{ id: 'w', type: 'wire' }]);
		g.cables = g.cables.filter((x) => !(x.from === 'd' && x.to === 's'));
		g.cables.push(c('d', 'w'), c('w', 's'));
		expect(planLoops(g.nodes, g.cables, g.bus)).toEqual([]);
	});

	it('keeps buses apart, and runs two loops sharing a node as one', () => {
		// Two combs off one SUM: bus 0 through d0, bus 1 through d1.
		const nodes: N[] = [
			{ id: 'sum', type: 'sum' },
			{ id: 'd0', type: 'delay' },
			{ id: 's0', type: 'fbsend' },
			{ id: 'r0', type: 'fbrtn' },
			{ id: 'd1', type: 'delay' },
			{ id: 's1', type: 'fbsend' },
			{ id: 'r1', type: 'fbrtn' }
		];
		const cables = [
			c('sum', 'd0'),
			c('d0', 's0'),
			c('r0', 'sum'),
			c('sum', 'd1'),
			c('d1', 's1'),
			c('r1', 'sum')
		];
		const bus = (id: string) => (id.endsWith('1') ? 1 : 0);
		const islands = planLoops(nodes, cables, bus);
		expect(islands).toHaveLength(1);
		expect(islands[0].members).toHaveLength(7);
		expect(islands[0].lenders).toEqual(new Set(['d0', 'd1']));

		// Apart, they are two.
		const apart = planLoops(
			[...nodes, { id: 'sum1', type: 'sum' }],
			[
				c('sum', 'd0'),
				c('d0', 's0'),
				c('r0', 'sum'),
				c('sum1', 'd1'),
				c('d1', 's1'),
				c('r1', 'sum1')
			],
			bus
		);
		expect(apart).toHaveLength(2);
	});

	it('leaves a node the activation does not build out of every loop through it', () => {
		const g = comb();
		expect(planLoops(g.nodes, g.cables, g.bus, (id) => id !== 'fb')).toEqual([]);
	});
});
