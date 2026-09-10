import { describe, it, expect } from 'vitest';
import { PURE_NODES } from '../../src/lib/stores/node-graph';
import { CMP_TESTS, LOGIC_OPS, MODULE_SPECS } from '../../src/lib/stores/synth-modules';
import { roleOf, rolesCompatible } from '../../src/lib/stores/graph-model';

/**
 * Truth as a patchable value.
 *
 * A condition used to be a callback the engine held -- `whenHolds(nodeId)` --
 * which meant the only questions a patch could ask were the ones already
 * written into the engine. These are the nodes that make the question itself
 * something you build: CMP turns a quantity into a yes or no, LOGIC and NOT
 * combine those, and the lattice keeps the result away from anything that
 * wanted an amount.
 */

const evalPure = (
	type: string,
	inputs: Record<string, number>,
	params: Record<string, number> = {}
) =>
	PURE_NODES[type](
		{ get: (port, fallback) => inputs[port] ?? fallback },
		(key, def) => params[key] ?? def
	);

const testIndex = (label: string) => CMP_TESTS.findIndex((t) => t.label === label);
const opIndex = (label: string) => LOGIC_OPS.findIndex((o) => o.label === label);
const specOf = (id: string) => MODULE_SPECS.find((m) => m.id === id)!;

describe('CMP, where an amount becomes a truth', () => {
	it('applies each test its picker offers', () => {
		const cmp = (a: number, b: number, label: string) =>
			evalPure('cmp', { a, b }, { test: testIndex(label) });
		expect(cmp(5, 3, '>')).toBe(1);
		expect(cmp(3, 5, '>')).toBe(0);
		expect(cmp(3, 3, '>')).toBe(0);
		expect(cmp(3, 3, '>=')).toBe(1);
		expect(cmp(3, 5, '<')).toBe(1);
		expect(cmp(3, 3, '<=')).toBe(1);
		expect(cmp(3, 3, '=')).toBe(1);
		expect(cmp(3, 4, '=')).toBe(0);
		expect(cmp(3, 4, '!=')).toBe(1);
		expect(cmp(3, 3, '!=')).toBe(0);
	});

	it('compares equality within a tolerance, because these are floats', () => {
		/* 0.1 + 0.2 is not 0.3, and a value reaching CMP has usually been through
		   a MAP or a division on the way. An `=` that is almost never true would
		   be a trap rather than a test -- the patch looks right and the branch
		   never fires. */
		expect(0.1 + 0.2 === 0.3).toBe(false);
		expect(evalPure('cmp', { a: 0.1 + 0.2, b: 0.3 }, { test: testIndex('=') })).toBe(1);
		expect(evalPure('cmp', { a: 0.1 + 0.2, b: 0.3 }, { test: testIndex('!=') })).toBe(0);
		// Still a comparison, not a rounding: a real difference is a difference.
		expect(evalPure('cmp', { a: 0.5, b: 0.5001 }, { test: testIndex('=') })).toBe(0);
	});

	it('hands out exactly one or zero, whatever it was given', () => {
		/* Every logic node downstream reads "not zero" as true, so what CMP emits
		   has to be the two values and not the difference between the operands.
		   A CMP returning 4700 would still read as true and would also be a
		   perfectly usable frequency, which is the confusion `bool` exists to
		   prevent. */
		for (const t of CMP_TESTS) {
			const v = evalPure('cmp', { a: 8000, b: 0.001 }, { test: testIndex(t.label) });
			expect([0, 1]).toContain(v);
		}
	});

	it('defaults to a comparison rather than to nothing', () => {
		// An unset picker is the first entry, and the first entry is a real test.
		expect(evalPure('cmp', { a: 5, b: 3 })).toBe(1);
		expect(evalPure('cmp', { a: 3, b: 5 })).toBe(0);
	});
});

describe('LOGIC and NOT', () => {
	it('combines two truths each way its picker offers', () => {
		const gate = (a: number, b: number, label: string) =>
			evalPure('logic', { a, b }, { op: opIndex(label) });
		expect([gate(1, 1, 'AND'), gate(1, 0, 'AND'), gate(0, 0, 'AND')]).toEqual([1, 0, 0]);
		expect([gate(1, 1, 'OR'), gate(1, 0, 'OR'), gate(0, 0, 'OR')]).toEqual([1, 1, 0]);
		expect([gate(1, 1, 'XOR'), gate(1, 0, 'XOR'), gate(0, 0, 'XOR')]).toEqual([0, 1, 0]);
		expect([gate(1, 1, 'NAND'), gate(1, 0, 'NAND'), gate(0, 0, 'NAND')]).toEqual([0, 1, 1]);
		expect([gate(1, 1, 'NOR'), gate(1, 0, 'NOR'), gate(0, 0, 'NOR')]).toEqual([0, 0, 1]);
	});

	it('negates, and reads an empty socket as false', () => {
		expect(evalPure('not', { a: 1 })).toBe(0);
		expect(evalPure('not', { a: 0 })).toBe(1);
		/* Unwired NOT is true, because it is NOT of the false that an empty
		   socket is. The two have to agree: if an empty socket were false in
		   LOGIC and something else here, a half-built patch would contradict
		   itself. */
		expect(evalPure('not', {})).toBe(1);
	});

	it('is off when half-built, rather than changing meaning with the picker', () => {
		/* There is no identity that works for the whole list -- false is the
		   identity for OR and true is the identity for AND -- so an empty socket
		   is false everywhere rather than whatever would leave the other leg
		   untouched. A half-built AND is off, which is what a half-built gate
		   should be. */
		expect(evalPure('logic', { a: 1 }, { op: opIndex('AND') })).toBe(0);
		expect(evalPure('logic', { a: 1 }, { op: opIndex('OR') })).toBe(1);
		expect(evalPure('logic', {}, { op: opIndex('AND') })).toBe(0);
		expect(evalPure('logic', {}, { op: opIndex('OR') })).toBe(0);
	});

	it('treats any non-zero as true, since a truth travels as a number', () => {
		expect(evalPure('logic', { a: -3, b: 0.5 }, { op: opIndex('AND') })).toBe(1);
		expect(evalPure('not', { a: -3 })).toBe(0);
	});
});

describe('the picker lists and the evaluator agree', () => {
	/* Two hand-written copies of one order disagree eventually, and the one
	   nobody corrects is the one that draws. The card selects from these lists
	   by index and the evaluator switches on the same number, so the pairing is
	   pinned here rather than trusted. */
	it('names every test the evaluator can apply, in its order', () => {
		expect(CMP_TESTS.map((t) => t.label)).toEqual(['>', '>=', '<', '<=', '=', '!=']);
	});

	it('names every operation the evaluator can apply, in its order', () => {
		expect(LOGIC_OPS.map((o) => o.label)).toEqual(['AND', 'OR', 'XOR', 'NAND', 'NOR']);
	});

	it('lets the picker reach every branch and no further', () => {
		/* The picker's range is what bounds the stored number, so a max that is
		   short of the list hides the last entry and one past it selects a
		   branch that does not exist. */
		const pick = (id: string, key: string) => specOf(id).params.find((p) => p.key === key)!;
		expect(pick('cmp', 'test').max).toBe(CMP_TESTS.length - 1);
		expect(pick('cmp', 'test').choices).toEqual(CMP_TESTS.map((t) => t.label));
		expect(pick('logic', 'op').max).toBe(LOGIC_OPS.length - 1);
		expect(pick('logic', 'op').choices).toEqual(LOGIC_OPS.map((o) => o.label));
	});
});

describe('the lattice keeps truth to itself', () => {
	it('sends a truth only where a truth is wanted', () => {
		const out = roleOf(specOf('cmp').outputs[0]);
		expect(out).toBe('bool');
		expect(rolesCompatible(out, roleOf(specOf('logic').inputs[0]))).toBe(true);
		expect(rolesCompatible(out, roleOf(specOf('not').inputs[0]))).toBe(true);
	});

	it('refuses a truth where a quantity was wanted, and the reverse', () => {
		/* 4000 is not more true than 800, and a yes is not a cutoff. This is the
		   pair the role exists to separate -- everything else in the control
		   family converts into everything else by arithmetic, and this one does
		   not. */
		const osc = specOf('osc').inputs.find((p) => p.id === 'pitch')!;
		expect(rolesCompatible('bool', roleOf(osc))).toBe(false);
		expect(rolesCompatible(roleOf(osc), 'bool')).toBe(false);
		// Not sound either, in either direction.
		expect(rolesCompatible('bool', 'signal')).toBe(false);
		expect(rolesCompatible('signal', 'bool')).toBe(false);
	});

	it('is the one door between an amount and a truth', () => {
		/* CMP takes ordinary values and hands back a truth; every other logic
		   node takes truths only. That is what lets `bool` be isolated in the
		   lattice without walling the family off from the rest of the patch --
		   there is exactly one crossing, and it is a card on the canvas. */
		const crossings = MODULE_SPECS.filter(
			(m) =>
				m.outputs.some((o) => roleOf(o) === 'bool') && m.inputs.some((i) => roleOf(i) !== 'bool')
		).map((m) => m.id);
		expect(crossings).toEqual(['cmp']);
	});

	it('keeps every logic module free of knobs that duplicate a socket', () => {
		/* The trap PWM's PW was pulled out of: a knob beside a socket of the same
		   name means the patch has two opinions about one value. These have a
		   picker and nothing else -- what is being compared is what arrives. */
		for (const id of ['cmp', 'logic', 'not']) {
			const spec = specOf(id);
			const knobs = spec.params.filter((p) => !p.choices && !p.field);
			expect(knobs).toEqual([]);
		}
	});
});
