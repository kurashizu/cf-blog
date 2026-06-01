/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Safe Expression Evaluator — No eval, no Function constructor
 * Parses and evaluates arithmetic, logical, and member access expressions
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Value = any;

interface Token {
  type: 'number' | 'string' | 'boolean' | 'null' | 'identifier' | 'op' | 'lparen' | 'rparen' | 'lbracket' | 'rbracket' | 'comma' | 'dot' | 'eof';
  value: string;
}

const SAFE_GLOBALS: Record<string, Value> = {
  Math: {
    E: Math.E,
    PI: Math.PI,
    abs: Math.abs,
    acos: Math.acos,
    asin: Math.asin,
    atan: Math.atan,
    atan2: Math.atan2,
    ceil: Math.ceil,
    cos: Math.cos,
    exp: Math.exp,
    floor: Math.floor,
    hypot: Math.hypot,
    log: Math.log,
    log10: Math.log10,
    log2: Math.log2,
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    random: Math.random,
    round: Math.round,
    sign: Math.sign,
    sin: Math.sin,
    sqrt: Math.sqrt,
    tan: Math.tan,
    trunc: Math.trunc,
    cbrt: Math.cbrt,
  },
  JSON: {
    stringify: JSON.stringify,
    parse: (s: string) => {
      try { return JSON.parse(s); } catch { return undefined; }
    },
  },
  Number: {
    MAX_VALUE: Number.MAX_VALUE,
    MIN_VALUE: Number.MIN_VALUE,
    NaN: NaN,
    NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
    POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
    isFinite: Number.isFinite,
    isInteger: Number.isInteger,
    isNaN: Number.isNaN,
    isSafeInteger: Number.isSafeInteger,
    parseFloat: parseFloat,
    parseInt: parseInt,
  },
  Boolean: {
    prototype: true,
  },
  String: {
    fromCharCode: String.fromCharCode,
    fromCodePoint: String.fromCodePoint,
    prototype: true,
  },
  Array: {
    isArray: Array.isArray,
    prototype: true,
  },
  Object: {
    prototype: true,
    keys: Object.keys,
    values: Object.values,
    entries: Object.entries,
    assign: Object.assign,
    create: Object.create,
    freeze: Object.freeze,
    is: Object.is,
  },
  RegExp: {
    prototype: true,
  },
  Map: {
    prototype: true,
  },
  Set: {
    prototype: true,
  },
  Date: {
    now: Date.now,
    parse: Date.parse,
    UTC: Date.UTC,
    prototype: true,
  },
  parseInt,
  parseFloat,
  isFinite,
  isNaN,
  encodeURI,
  decodeURI,
  encodeURIComponent,
  decodeURIComponent,
  Infinity,
  NaN,
  undefined,
};

class Lexer {
  private pos = 0;
  private readonly input: string;

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.pos < this.input.length) {
      this.skipWhitespace();
      if (this.pos >= this.input.length) break;
      const ch = this.input[this.pos];
      if (/\d/.test(ch) || (ch === '.' && /\d/.test(this.input[this.pos + 1] || ''))) {
        tokens.push(this.readNumber());
      } else if (ch === '"' || ch === "'") {
        tokens.push(this.readString(ch));
      } else if (/[a-zA-Z_$]/.test(ch)) {
        tokens.push(this.readIdentifier());
      } else if (ch === '(') {
        this.pos++;
        tokens.push({ type: 'lparen', value: '(' });
      } else if (ch === ')') {
        this.pos++;
        tokens.push({ type: 'rparen', value: ')' });
      } else if (ch === '[') {
        this.pos++;
        tokens.push({ type: 'lbracket', value: '[' });
      } else if (ch === ']') {
        this.pos++;
        tokens.push({ type: 'rbracket', value: ']' });
      } else if (ch === ',') {
        this.pos++;
        tokens.push({ type: 'comma', value: ',' });
      } else if (ch === '.') {
        const peek = this.input[this.pos + 1];
        if (peek === '.') {
          this.pos += 3;
          tokens.push({ type: 'op', value: '...' });
        } else if (/[0-9]/.test(peek)) {
          tokens.push(this.readNumber());
        } else {
          this.pos++;
          tokens.push({ type: 'dot', value: '.' });
        }
      } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '=' || ch === '!' || ch === '<' || ch === '>' || ch === '&' || ch === '|') {
        tokens.push(this.readOperator());
      } else {
        throw new Error(`Unexpected character: ${ch}`);
      }
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  private skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) this.pos++;
  }

  private readNumber(): Token {
    let num = '';
    while (this.pos < this.input.length && /[0-9.]/.test(this.input[this.pos])) {
      num += this.input[this.pos++];
    }
    return { type: 'number', value: num };
  }

  private readString(quote: string): Token {
    this.pos++;
    let str = '';
    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') {
        this.pos++;
        const esc = this.input[this.pos++];
        str += esc === 'n' ? '\n' : esc === 't' ? '\t' : esc === 'r' ? '\r' : esc === '\\' ? '\\' : esc === quote ? quote : esc;
      } else {
        str += this.input[this.pos++];
      }
    }
    this.pos++;
    return { type: 'string', value: str };
  }

  private readIdentifier(): Token {
    let id = '';
    while (this.pos < this.input.length && /[a-zA-Z0-9_$]/.test(this.input[this.pos])) {
      id += this.input[this.pos++];
    }
    if (id === 'true') return { type: 'boolean', value: 'true' };
    if (id === 'false') return { type: 'boolean', value: 'false' };
    if (id === 'null') return { type: 'null', value: 'null' };
    if (id === 'undefined') return { type: 'identifier', value: 'undefined' };
    if (id === 'Infinity') return { type: 'number', value: id };
    if (id === 'NaN') return { type: 'number', value: id };
    return { type: 'identifier', value: id };
  }

  private readOperator(): Token {
    const two = this.input.slice(this.pos, this.pos + 2);
    if (['==', '!=', '===', '!==', '<=', '>=', '&&', '||', '**'].includes(two)) {
      this.pos += 2;
      return { type: 'op', value: two };
    }
    return { type: 'op', value: this.input[this.pos++] };
  }
}

class Parser {
  private tokens: Token[] = [];
  private pos = 0;

  parse(tokens: Token[]): Value {
    this.tokens = tokens;
    this.pos = 0;
    const result = this.parseExpr();
    if (this.current().type !== 'eof') {
      throw new Error(`Unexpected token: ${this.current().value}`);
    }
    return result;
  }

  private current(): Token {
    return this.tokens[this.pos] || { type: 'eof', value: '' };
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private parseExpr(): Value {
    return this.parseOr();
  }

  private parseOr(): Value {
    let left = this.parseAnd();
    while (this.current().type === 'op' && (this.current().value === '||' || this.current().value === '...')) {
      const op = this.advance().value;
      const right = this.parseAnd();
      if (op === '...') { left = right; continue; }
      left = left || right;
    }
    return left;
  }

  private parseAnd(): Value {
    let left = this.parseEquality();
    while (this.current().type === 'op' && this.current().value === '&&') {
      this.advance();
      const right = this.parseEquality();
      left = left && right;
    }
    return left;
  }

  private parseEquality(): Value {
    let left = this.parseComparison();
    while (this.current().type === 'op' && ['==', '!=', '===', '!=='].includes(this.current().value)) {
      const op = this.advance().value;
      const right = this.parseComparison();
      if (op === '==') left = left == right;
      else if (op === '===') left = left === right;
      else if (op === '!=') left = left != right;
      else if (op === '!==') left = left !== right;
    }
    return left;
  }

  private parseComparison(): Value {
    let left = this.parseAdditive();
    while (this.current().type === 'op' && ['<', '>', '<=', '>='].includes(this.current().value)) {
      const op = this.advance().value;
      const right = this.parseAdditive();
      if (op === '<') left = left < right;
      else if (op === '>') left = left > right;
      else if (op === '<=') left = left <= right;
      else if (op === '>=') left = left >= right;
    }
    return left;
  }

  private parseAdditive(): Value {
    let left = this.parseMultiplicative();
    while (this.current().type === 'op' && ['+', '-'].includes(this.current().value)) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      if (op === '+') {
        if (typeof left === 'string' || typeof right === 'string') left = String(left) + String(right);
        else left = left + right;
      } else {
        left = left - right;
      }
    }
    return left;
  }

  private parseMultiplicative(): Value {
    let left = this.parsePower();
    while (this.current().type === 'op' && ['*', '/', '%'].includes(this.current().value)) {
      const op = this.advance().value;
      const right = this.parsePower();
      if (op === '*') left = left * right;
      else if (op === '/') left = left / right;
      else if (op === '%') left = left % right;
    }
    return left;
  }

  private parsePower(): Value {
    let left = this.parseUnary();
    if (this.current().type === 'op' && this.current().value === '**') {
      this.advance();
      const right = this.parsePower();
      left = Math.pow(left, right);
    }
    return left;
  }

  private parseUnary(): Value {
    if (this.current().type === 'op' && this.current().value === '-') {
      this.advance();
      return -(this.parseUnary() as number);
    }
    return this.parseMember();
  }

  private parseMember(): Value {
    let obj: Value = this.parsePrimary();
    while (this.current().type === 'dot' || this.current().type === 'lbracket' || this.current().type === 'lparen') {
      if (this.current().type === 'lparen') {
        this.advance();
        const args: Value[] = [];
        while (this.current().type !== 'rparen') {
          if (this.current().type === 'eof') throw new Error('Expected )');
          args.push(this.parseExpr());
          if (this.current().type === 'comma') this.advance();
        }
        this.advance();
        if (typeof obj !== 'function') throw new Error(`${obj} is not a function`);
        obj = obj(...args);
      } else if (this.current().type === 'dot') {
        this.advance();
        const prop = this.advance().value;
        if (obj == null) throw new Error(`Cannot read property ${prop} of ${obj}`);
        obj = obj[prop];
      } else {
        this.advance();
        const idx = this.parseExpr();
        this.expect('rbracket');
        if (obj == null) throw new Error(`Cannot read index`);
        obj = obj[Number(idx)];
      }
    }
    return obj;
  }

  private parsePrimary(): Value {
    const tok = this.current();
    if (tok.type === 'number') {
      this.advance();
      return parseFloat(tok.value);
    }
    if (tok.type === 'string') {
      this.advance();
      return tok.value;
    }
    if (tok.type === 'boolean') {
      this.advance();
      return tok.value === 'true';
    }
    if (tok.type === 'null') {
      this.advance();
      return null;
    }
    if (tok.type === 'identifier') {
      const name = this.advance().value;
      const val = SAFE_GLOBALS[name];
      if (val === undefined) throw new Error(`${name} is not defined`);
      return val;
    }
    if (tok.type === 'lparen') {
      this.advance();
      const val = this.parseExpr();
      this.expect('rparen');
      return val;
    }
    if (tok.type === 'lbracket') {
      this.advance();
      const arr: Value[] = [];
      while (this.current().type !== 'rbracket' && this.current().type !== 'eof') {
        arr.push(this.parseExpr());
        if (this.current().type === 'comma') this.advance();
      }
      this.expect('rbracket');
      return arr;
    }
    throw new Error(`Unexpected token: ${tok.value}`);
  }

  private expect(type: string) {
    if (this.current().type !== type as Token['type']) {
      throw new Error(`Expected ${type}`);
    }
    this.advance();
  }
}

export interface EvalResult {
  success: boolean;
  result?: string;
  error?: string;
}

const FORBIDDEN_PATTERNS = [
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /\bimportScripts\s*\(/i,
  /\bimport\s*\(/i,
  /\brequire\s*\(/i,
  /\bdocument\b/i,
  /\bwindow\b/i,
  /\bglobalThis\b/i,
  /\bfetch\s*\(/i,
  /\bXMLHttpRequest\b/i,
  /\bWebSocket\b/i,
  /\bWorker\b/i,
  /\basync\s+\w*\s*\(/i,
  /\bawait\s+/i,
  /\bfunction\b/i,
  /\bclass\b/i,
  /\bthis\b/i,
  /\bsuper\b/i,
  /\bthrow\b/i,
  /\btry\b/i,
  /\bcatch\b/i,
  /\bnew\s+/i,
  /\btypeof\b/i,
  /\bdelete\b/i,
  /\bvoid\b/i,
  /\bvar\b/i,
  /\blet\b/i,
  /\bconst\b/i,
  /\bfor\s*\(/i,
  /\bwhile\s*\(/i,
  /\bdo\s*\{/i,
  /\bswitch\s*\(/i,
  /\bwith\s*\(/i,
];

export function evaluate(code: string): EvalResult {
  try {
    for (const pat of FORBIDDEN_PATTERNS) {
      if (pat.test(code)) {
        const match = code.match(pat);
        return { success: false, error: `${match?.[0] ?? pat.source} is not allowed` };
      }
    }
    if (/^\s*\{/.test(code) && /\}\s*$/.test(code.trim())) {
      return { success: false, error: 'Object/block literals not allowed' };
    }
    if (/;\s*$/.test(code.trim())) {
      return { success: false, error: 'Statements not allowed' };
    }

    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser();
    const result = parser.parse(tokens);
    return { success: true, result: String(result) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
