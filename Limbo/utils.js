'use strict';

const W = 1200, H = 700;
// Inner play area (inside the room walls)
const PLAY = { x: 92, y: 58, w: 1016, h: 584 };

class Vec2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  add(v)    { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v)    { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s)  { return new Vec2(this.x * s, this.y * s); }
  len()     { return Math.hypot(this.x, this.y); }
  norm()    { const l = this.len(); return l ? this.scale(1 / l) : new Vec2(); }
  dot(v)    { return this.x * v.x + this.y * v.y; }
  dist(v)   { return this.sub(v).len(); }
  angle()   { return Math.atan2(this.y, this.x); }
  clone()   { return new Vec2(this.x, this.y); }
  iadd(v)   { this.x += v.x; this.y += v.y; return this; }
  isub(v)   { this.x -= v.x; this.y -= v.y; return this; }
  iscale(s) { this.x *= s; this.y *= s; return this; }
  set(x, y) { this.x = x; this.y = y; return this; }
  static fromAngle(a, l = 1) { return new Vec2(Math.cos(a) * l, Math.sin(a) * l); }
  static lerp(a, b, t) { return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
}

const TAU = Math.PI * 2;
const rand    = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const randFrom = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp    = (a, b, t) => a + (b - a) * t;
const angleDiff = (a, b) => { let d = ((b - a) % TAU + TAU) % TAU; return d > Math.PI ? d - TAU : d; };

function circleCircle(ax, ay, ar, bx, by, br) {
  const dx = ax - bx, dy = ay - by, r = ar + br;
  return dx * dx + dy * dy < r * r;
}

function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

function pushOutOfRect(cx, cy, cr, rx, ry, rw, rh) {
  if (!circleRect(cx, cy, cr, rx, ry, rw, rh)) return { x: cx, y: cy };
  const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
  let dx = cx - nx, dy = cy - ny;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.0001) {
    const dL = cx - rx, dR = rx + rw - cx, dT = cy - ry, dB = ry + rh - cy;
    const m = Math.min(dL, dR, dT, dB);
    if (m === dL) return { x: rx - cr, y: cy };
    if (m === dR) return { x: rx + rw + cr, y: cy };
    if (m === dT) return { x: cx, y: ry - cr };
    return { x: cx, y: ry + rh + cr };
  }
  const ov = cr - dist;
  return { x: cx + dx / dist * ov, y: cy + dy / dist * ov };
}

function keepInBounds(cx, cy, cr) {
  return {
    x: clamp(cx, PLAY.x + cr, PLAY.x + PLAY.w - cr),
    y: clamp(cy, PLAY.y + cr, PLAY.y + PLAY.h - cr)
  };
}

// Fancy color helpers
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return { r, g, b };
}

function rgba(r, g, b, a) { return `rgba(${r},${g},${b},${a})`; }

// Polyfill for roundRect
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ── Seeded pseudo-random number generator (Xorshift32) ──────
class SeededRNG {
  constructor(seed) { this.seed = (seed >>> 0) || 0xdeadbeef; }
  next() {
    let s = this.seed;
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 0x100000000;
  }
  rand(a, b)   { return a + this.next() * (b - a); }
  randInt(a,b) { return Math.floor(a + this.next() * (b - a + 1)); }
  from(arr)    { return arr[Math.floor(this.next() * arr.length)]; }
  bool(p=0.5)  { return this.next() < p; }
}
// Global run RNG — replaced each run via RunRNG = new SeededRNG(seed)
let RunRNG = new SeededRNG(1);
