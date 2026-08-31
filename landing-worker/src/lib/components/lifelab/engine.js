// LIFE.LAB — core automaton. Bounded grid, padded border, B3/S23.
export class Life {
  /** @param {number} w @param {number} h */
  constructor(w, h) {
    this.w = w; this.h = h; this.stride = w + 2;
    const n = (w + 2) * (h + 2);
    this.a = new Uint8Array(n);   // 0 = dead, >0 = age
    this.b = new Uint8Array(n);
    this.gen = 0; this.pop = 0;
  }
  /** @param {number} x @param {number} y */
  idx(x, y) { return (y + 1) * this.stride + (x + 1); }
  /** @param {number} x @param {number} y */
  get(x, y) { return this.a[this.idx(x, y)]; }
  /** @param {number} x @param {number} y @param {number} v */
  set(x, y, v) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = this.idx(x, y);
    if ((this.a[i] > 0) !== (v > 0)) this.pop += v > 0 ? 1 : -1;
    this.a[i] = v;
  }
  clear() { this.a.fill(0); this.b.fill(0); this.gen = 0; this.pop = 0; }
  snapshot() { return { a: this.a.slice(), gen: this.gen, pop: this.pop }; }
  /** @param {{ a: Uint8Array, gen: number, pop: number }} s */
  restore(s) { this.a.set(s.a); this.gen = s.gen; this.pop = s.pop; }
  step() {
    const { w, h, stride: s, a } = this;
    const b = this.b;
    let pop = 0, changed = 0;
    for (let y = 1; y <= h; y++) {
      let i = y * s + 1;
      for (let x = 0; x < w; x++, i++) {
        const n =
          (a[i - s - 1] ? 1 : 0) + (a[i - s] ? 1 : 0) + (a[i - s + 1] ? 1 : 0) +
          (a[i - 1] ? 1 : 0) + (a[i + 1] ? 1 : 0) +
          (a[i + s - 1] ? 1 : 0) + (a[i + s] ? 1 : 0) + (a[i + s + 1] ? 1 : 0);
        const v = a[i];
        const nv = v ? (n === 2 || n === 3 ? (v < 250 ? v + 1 : v) : 0) : (n === 3 ? 1 : 0);
        b[i] = nv;
        if (nv) pop++;
        if ((nv > 0) !== (v > 0)) changed++;
      }
    }
    this.b = a; this.a = b;
    this.pop = pop; this.gen++;
    return { changed };
  }
  hash() {
    const a = this.a, n = a.length;
    let x = 2166136261 >>> 0;
    for (let i = 0; i < n; i++) if (a[i]) x = Math.imul(x ^ i, 16777619) >>> 0;
    return x;
  }
  /** @param {{ x: number, y: number, w: number, h: number }} r */
  rectCount(r) {
    let c = 0;
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (this.a[this.idx(x, y)]) c++;
    return c;
  }
}
