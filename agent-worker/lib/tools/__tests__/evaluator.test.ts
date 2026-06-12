/**
 * Tests for the safe expression evaluator.
 *
 * The evaluator is the security gate for the `eval_expression` tool — if any
 * of the FORBIDDEN_PATTERNS tests pass, an LLM-controlled user can break
 * out of the sandbox. Treat any new failure here as a critical regression.
 */
import { describe, it, expect } from "vitest";
import { evaluate } from "../../evaluator";

describe("evaluate — arithmetic", () => {
    it("evaluates simple numbers", () => {
        expect(evaluate("42")).toEqual({ success: true, result: "42" });
        expect(evaluate("3.14")).toEqual({ success: true, result: "3.14" });
        expect(evaluate("-7")).toEqual({ success: true, result: "-7" });
    });

    it("handles arithmetic operators with correct precedence", () => {
        expect(evaluate("2 + 3 * 4")).toEqual({ success: true, result: "14" });
        expect(evaluate("(2 + 3) * 4")).toEqual({
            success: true,
            result: "20",
        });
        expect(evaluate("2 ** 10")).toEqual({ success: true, result: "1024" });
        expect(evaluate("10 % 3")).toEqual({ success: true, result: "1" });
    });

    it("supports string concatenation with +", () => {
        expect(evaluate('"hello" + " " + "world"')).toEqual({
            success: true,
            result: "hello world",
        });
        expect(evaluate('"count: " + 5')).toEqual({
            success: true,
            result: "count: 5",
        });
    });
});

describe("evaluate — comparison and logical", () => {
    it("evaluates comparisons", () => {
        expect(evaluate("1 < 2")).toEqual({ success: true, result: "true" });
        expect(evaluate("3 == 3")).toEqual({ success: true, result: "true" });
        expect(evaluate("3 === '3'")).toEqual({
            success: true,
            result: "false",
        });
        expect(evaluate("1 >= 2")).toEqual({ success: true, result: "false" });
    });

    it("evaluates && and ||", () => {
        expect(evaluate("true && false")).toEqual({
            success: true,
            result: "false",
        });
        expect(evaluate("true || false")).toEqual({
            success: true,
            result: "true",
        });
    });
});

describe("evaluate — member access and function calls", () => {
    it("evaluates nested member access", () => {
        expect(evaluate("Math.max(1, 2, 3)")).toEqual({
            success: true,
            result: "3",
        });
        expect(evaluate("Math.PI")).toMatchObject({ success: true });
    });

    it("evaluates array literals and indexing", () => {
        expect(evaluate("[1, 2, 3][1]")).toEqual({
            success: true,
            result: "2",
        });
    });

    it("supports JSON.parse and JSON.stringify", () => {
        expect(evaluate('JSON.parse("42")')).toEqual({
            success: true,
            result: "42",
        });
        // Object literals like {a:1} are deliberately blocked by the sandbox,
        // so the canonical way to construct objects is via JSON.parse.
        expect(evaluate("JSON.stringify(JSON.parse('{\"a\":1}'))")).toEqual({
            success: true,
            result: '{"a":1}',
        });
    });
});

describe("evaluate — sandbox enforcement", () => {
    it.each([
        ["eval", "eval('1+1')"],
        ["Function constructor", "Function('return 1')()"],
        ["importScripts", "importScripts('http://evil')"],
        ["dynamic import()", "import('http://evil')"],
        ["require()", "require('fs')"],
        ["document", "document.cookie"],
        ["window", "window.location"],
        ["globalThis", "globalThis.fetch"],
        ["fetch()", "fetch('http://evil')"],
        ["XMLHttpRequest", "new XMLHttpRequest()"],
        ["WebSocket", "new WebSocket('ws://evil')"],
        ["Worker", "new Worker('a.js')"],
        ["async function", "async function f() {}"],
        ["await", "await 1"],
        ["function declaration", "function f() { return 1 }"],
        ["class declaration", "class A {}"],
        ["this", "this.x"],
        ["super", "super()"],
        ["throw", "throw 1"],
        ["try/catch", "try { 1 } catch (e) {}"],
        ["new keyword", "new Date()"],
        ["typeof", "typeof 1"],
        ["delete", "delete x"],
        ["void", "void 0"],
        ["var declaration", "var x = 1"],
        ["let declaration", "let x = 1"],
        ["const declaration", "const x = 1"],
        ["for loop", "for (let i=0; i<3; i++) {}"],
        ["while loop", "while (true) {}"],
        ["do-while", "do {} while (true)"],
        ["switch", "switch (1) { default: }"],
        ["with()", "with (obj) {}"],
    ])("blocks %s", (_name, code) => {
        const r = evaluate(code);
        expect(r.success).toBe(false);
    });

    it("blocks object/block literals", () => {
        const r = evaluate("({a: 1})");
        expect(r.success).toBe(false);
    });

    it("blocks statement-terminated input (trailing semicolons)", () => {
        const r = evaluate("1 + 1;");
        expect(r.success).toBe(false);
    });

    it("returns an error for unknown identifiers", () => {
        const r = evaluate("undefinedVar");
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/not defined/i);
    });
});

describe("evaluate — error reporting", () => {
    it("returns a parse error for unmatched parentheses", () => {
        const r = evaluate("(1 + 2");
        expect(r.success).toBe(false);
    });

    it("returns a clear error message", () => {
        const r = evaluate("Math.foo()");
        expect(r.success).toBe(false);
        expect(typeof r.error).toBe("string");
    });
});
