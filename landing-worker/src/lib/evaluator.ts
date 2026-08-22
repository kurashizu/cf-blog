/**
 * Safe sandboxed mathematical / JS expression evaluator
 * Supports Math.* functions, standard arithmetic operators, and bitwise logic.
 */
export function evaluateSafeJS(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return 'ERR: empty expression';

  // Allowed tokens check: numbers, operators, Math.*, whitespace, parentheses
  const sanitized = trimmed.replace(/\bMath\.(PI|E|abs|sqrt|pow|sin|cos|tan|floor|ceil|round|log|log2|log10|min|max|random)\b/g, '');
  
  if (/[a-zA-Z_$]/.test(sanitized)) {
    return 'ERR: only pure math expressions and Math.* functions are permitted';
  }

  try {
    // Evaluates in a strict Function sandbox
    const result = new Function(`"use strict"; return (${trimmed});`)();
    if (typeof result === 'number') {
      return Number.isInteger(result) ? String(result) : result.toFixed(4).replace(/\.?0+$/, '');
    }
    return String(result);
  } catch (err: any) {
    return `ERR: ${err?.message || 'syntax error'}`;
  }
}
