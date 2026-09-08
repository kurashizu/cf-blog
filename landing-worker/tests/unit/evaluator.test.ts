import { describe, it, expect } from 'vitest';
import { evaluateSafeJS } from '../../src/lib/evaluator';

describe('arithmetic', () => {
	it('evaluates integers exactly', () => {
		expect(evaluateSafeJS('1 + 1')).toBe('2');
		expect(evaluateSafeJS('7 * 6')).toBe('42');
		expect(evaluateSafeJS('(2 + 3) * 4')).toBe('20');
	});

	it('trims a fractional result to four places and drops trailing zeros', () => {
		expect(evaluateSafeJS('1 / 2')).toBe('0.5');
		expect(evaluateSafeJS('10 / 4')).toBe('2.5');
		expect(evaluateSafeJS('1 / 3')).toBe('0.3333');
	});

	it('supports bitwise operators', () => {
		expect(evaluateSafeJS('1 << 4')).toBe('16');
		expect(evaluateSafeJS('12 & 10')).toBe('8');
		expect(evaluateSafeJS('12 | 3')).toBe('15');
		expect(evaluateSafeJS('5 ^ 3')).toBe('6');
	});

	it('handles negative and exponent forms', () => {
		expect(evaluateSafeJS('-4 + 1')).toBe('-3');
		expect(evaluateSafeJS('2 ** 10')).toBe('1024');
	});
});

describe('Math.* allowlist', () => {
	it('allows the listed functions and constants', () => {
		expect(evaluateSafeJS('Math.sqrt(16)')).toBe('4');
		expect(evaluateSafeJS('Math.max(3, 9)')).toBe('9');
		expect(evaluateSafeJS('Math.floor(3.9)')).toBe('3');
		expect(evaluateSafeJS('Math.pow(2, 8)')).toBe('256');
		expect(evaluateSafeJS('Math.round(Math.PI * 100)')).toBe('314');
	});

	it('rejects Math members that are not on the list', () => {
		expect(evaluateSafeJS('Math.sign(-2)')).toMatch(/^ERR:/);
		expect(evaluateSafeJS('Math.trunc(1.5)')).toMatch(/^ERR:/);
	});
});

describe('sandbox refuses anything but maths', () => {
	it('rejects an empty or blank expression', () => {
		expect(evaluateSafeJS('')).toBe('ERR: empty expression');
		expect(evaluateSafeJS('   ')).toBe('ERR: empty expression');
	});

	it.each([
		['identifier access', 'globalThis'],
		['property lookup', 'window.location'],
		['function call', 'alert(1)'],
		['constructor escape', "constructor.constructor('return 1')()"],
		['prototype escape', "''.constructor.constructor('return process')()"],
		['assignment to a global', 'x = 1'],
		['fetch', "fetch('/')"],
		['import', "import('fs')"],
		['string literal', "'abc'"],
		['bare word', 'process']
	])('rejects %s', (_label, expr) => {
		const out = evaluateSafeJS(expr);
		expect(out).toMatch(/^ERR: only pure math expressions/);
	});

	it('reports a syntax error rather than throwing', () => {
		expect(evaluateSafeJS('1 +')).toMatch(/^ERR:/);
		expect(evaluateSafeJS('((1)')).toMatch(/^ERR:/);
	});
});

describe('non-finite and non-number results', () => {
	it('renders division by zero as Infinity', () => {
		expect(evaluateSafeJS('1 / 0')).toBe('Infinity');
	});

	it('renders NaN', () => {
		expect(evaluateSafeJS('0 / 0')).toBe('NaN');
	});

	it('renders a boolean comparison', () => {
		expect(evaluateSafeJS('1 < 2')).toBe('true');
	});
});
