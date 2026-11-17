// Prozedurale Texturen: Haut (Poren, Sommersprossen, Gesicht), Iris, Haarsträhnen, Stoffstrukturen.
import * as THREE from 'three';
import { rng, undertoneTint } from '../core/appearance.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixRgb(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function tex(c, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.needsUpdate = true;
  return t;
}

/** Wert-Rauschen (tileable) für Poren-/Struktur-Normalmaps. */
function noiseField(size, cells, r) {
  const g = new Float32Array((cells + 1) * (cells + 1));
  for (let i = 0; i < g.length; i++) g[i] = r();
  for (let i = 0; i <= cells; i++) { g[i * (cells + 1) + cells] = g[i * (cells + 1)]; g[cells * (cells + 1) + i] = g[i]; }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = g[iy * (cells + 1) + ix], b = g[iy * (cells + 1) + ix + 1];
    const c = g[(iy + 1) * (cells + 1) + ix], d = g[(iy + 1) * (cells + 1) + ix + 1];
    out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  return out;
}

/** Höhenfeld → Normalmap (tangent space). */
function heightToNormal(h, size, strength) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * size + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function skinPoreNormal() {
  if (cache.has('pores')) return cache.get('pores');
  const size = 512, r = rng(7);
  const a = noiseField(size, 96, r), b = noiseField(size, 24, r), h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = a[i] * 0.7 + b[i] * 0.3 - (r() < 0.012 ? 0.6 : 0);
  const t = tex(heightToNormal(h, size, 2.2), { srgb: false, repeat: [6, 6] });
  cache.set('pores', t);
  return t;
}

/** Basisfarbe der Körperhaut mit leichter Fleckung und Sommersprossen (kachelbar). */
export function skinBodyMap(app) {
  const size = 512;
  const c = canvas(size, size), ctx = c.getContext('2d');
  const base = tinted(app);
  const r = rng(hash(app.skin) ^ 0x51);
  const n = noiseField(size, 12, r);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (n[i] - 0.5) * 0.06;
    img.data[i * 4] = clamp255(base[0] * (1 + v + 0.01));
    img.data[i * 4 + 1] = clamp255(base[1] * (1 + v - 0.005));
    img.data[i * 4 + 2] = clamp255(base[2] * (1 + v - 0.01));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  frecklesOn(ctx, size, size, app, r, (app.freckles / 100) * 900);
  return tex(c, { repeat: [3, 3] });
}

function frecklesOn(ctx, w, h, app, r, count, area = null) {
  const base = tinted(app);
  const fr = mixRgb(base, [120, 60, 30], 0.35 + 0.25 * (1 - lum(base)));
  for (let i = 0; i < count; i++) {
    const x = area ? area.x + (r() - 0.5) * area.w : r() * w;
    const y = area ? area.y + (r() - 0.5) * area.h : r() * h;
    const rad = 0.6 + r() * 1.8;
    ctx.fillStyle = `rgba(${fr[0] | 0},${fr[1] | 0},${fr[2] | 0},${0.18 + r() * 0.35})`;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
}

/**
 * Gesichtstextur auf der UV-Kugel des Kopfes: Lippen, Brauen, Wangenrötung,
 * Nasenlöcher, Wimpernkranz und Sommersprossen werden im 3D-Richtungsraum platziert.
 */
export function faceMap(app, eyeX, eyeY) {
  const W = 1024, H = 512;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const base = tinted(app);
  const dark = lum(base);
  const lip = mixRgb(base, dark > 0.45 ? [176, 82, 86] : [96, 42, 44], dark > 0.45 ? 0.5 : 0.38);
  const brow = mixRgb(hexToRgb(app.hairColor), [40, 28, 22], 0.35);
  const blush = mixRgb(base, [210, 90, 90], 0.12);
  const r = rng(hash(app.skin + app.hairColor) ^ 0x77);
  const n = noiseField(256, 16, r);
  const img = ctx.createImageData(W, H);
  const lf = 0.8 + (app.face.lipFullness / 100) * 0.6;
  const bt = 0.6 + (app.face.browRidge / 100) * 0.6;
  for (let py = 0; py < H; py++) {
    const v = 1 - (py + 0.5) / H;
    const theta = (1 - v) * Math.PI;
    const y = Math.cos(theta), st = Math.sin(theta);
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / W, phi = u * Math.PI * 2;
      const x = -Math.cos(phi) * st, z = Math.sin(phi) * st;
      let col = base.slice();
      const nv = (n[((py & 255) * 256) + (px & 255)] - 0.5) * 0.05;
      col = col.map((q) => q * (1 + nv));
      if (z > 0) {
        // Wangenrötung
        for (const sx of [-1, 1]) {
          const d = ((x - sx * 0.5) ** 2) / 0.05 + ((y + 0.22) ** 2) / 0.03;
          if (d < 1) col = mixRgb(col, blush, (1 - d) * 0.5);
        }
        // Lippen (Ober-/Unterlippe) mit Mundlinie
        const ly = (y + 0.56) / (0.075 * lf), lx = x / 0.27;
        const lipShape = lx * lx + ly * ly * (ly > 0 ? 1.6 : 1.1);
        if (lipShape < 1) col = mixRgb(col, lip, Math.min(1, (1 - lipShape) * 3) * 0.9);
        if (Math.abs(y + 0.555) < 0.006 && Math.abs(x) < 0.24) col = mixRgb(col, lip.map((q) => q * 0.55), 0.8);
        // Nasenlöcher
        for (const sx of [-1, 1]) {
          const d = ((x - sx * 0.08) ** 2) / 0.0012 + ((y + 0.385) ** 2) / 0.0005;
          if (d < 1) col = mixRgb(col, col.map((q) => q * 0.45), (1 - d));
        }
        // Brauen
        for (const sx of [-1, 1]) {
          const bx = (x - sx * (eyeX + 0.02)) / 0.2;
          const by = (y - (eyeY + 0.2) - 0.03 * (1 - bx * bx) * sx * 0) / (0.035 * bt);
          const d = bx * bx + by * by;
          if (d < 1 && r() > 0.15) col = mixRgb(col, brow, Math.min(1, (1 - d) * 3) * 0.95);
        }
        // Wimpernkranz um die Augen
        for (const sx of [-1, 1]) {
          const ex = (x - sx * eyeX) / 0.16, ey = (y - eyeY) / 0.085;
          const d = ex * ex + ey * ey;
          if (d > 0.75 && d < 1.15 && ey > -0.2) col = mixRgb(col, [35, 25, 22], (1 - Math.abs(d - 0.95) / 0.2) * 0.55);
        }
      }
      const i = (py * W + px) * 4;
      img.data[i] = clamp255(col[0]); img.data[i + 1] = clamp255(col[1]); img.data[i + 2] = clamp255(col[2]); img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // Sommersprossen konzentriert auf Nase/Wangen (Frontbereich u≈0,25)
  const cnt = (app.freckles / 100) * 700;
  frecklesOn(ctx, W, H, app, r, cnt, { x: W * 0.25, y: H * 0.56, w: W * 0.2, h: H * 0.16 });
  frecklesOn(ctx, W, H, app, r, cnt * 0.4, { x: W * 0.25, y: H * 0.5, w: W * 0.35, h: H * 0.4 });
  return tex(c);
}

export function irisMap(eyeHex) {
  const key = `iris${eyeHex}`;
  if (cache.has(key)) return cache.get(key);
  const s = 256, c = canvas(s, s), ctx = c.getContext('2d');
  const col = hexToRgb(eyeHex), r = rng(hash(eyeHex));
  ctx.fillStyle = '#f2ece6'; ctx.fillRect(0, 0, s, s);
  // Iris ≈ halber Augapfeldurchmesser; außen Lederhaut mit leichter Äderung
  const IR = s * 0.27;
  const sc = ctx.createRadialGradient(s / 2, s / 2, IR, s / 2, s / 2, s / 2);
  sc.addColorStop(0, '#f4efe9'); sc.addColorStop(1, '#e6d6cf');
  ctx.fillStyle = sc; ctx.fillRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, IR);
  g.addColorStop(0, '#050505'); g.addColorStop(0.3, '#050505');
  g.addColorStop(0.34, rgbStr(mixRgb(col, [230, 200, 140], 0.3)));
  g.addColorStop(0.72, rgbStr(col)); g.addColorStop(0.93, rgbStr(col.map((v) => v * 0.4)));
  g.addColorStop(1, 'rgba(40,30,25,0.0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s / 2, s / 2, IR, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, r0 = IR * 0.33, r1 = IR * (0.65 + r() * 0.3);
    ctx.strokeStyle = `rgba(${r() > 0.5 ? '255,240,210' : '20,15,10'},${0.05 + r() * 0.12})`;
    ctx.beginPath(); ctx.moveTo(s / 2 + Math.cos(a) * r0, s / 2 + Math.sin(a) * r0);
    ctx.lineTo(s / 2 + Math.cos(a) * r1, s / 2 + Math.sin(a) * r1); ctx.stroke();
  }
  const t = tex(c); cache.set(key, t); return t;
}

export function hairStrandMap(hairHex, texture) {
  const key = `hair${hairHex}${texture}`;
  if (cache.has(key)) return cache.get(key);
  const w = 512, h = 512, c = canvas(w, h), ctx = c.getContext('2d');
  const col = hexToRgb(hairHex), r = rng(hash(hairHex) ^ 3);
  ctx.fillStyle = rgbStr(col); ctx.fillRect(0, 0, w, h);
  const wav = texture === 'straight' ? 0 : texture === 'wavy' ? 6 : 12;
  for (let i = 0; i < 1400; i++) {
    const x = r() * w, light = r();
    const cc = light > 0.6 ? mixRgb(col, [255, 235, 200], 0.18 * light) : col.map((v) => v * (0.55 + light * 0.4));
    ctx.strokeStyle = `rgba(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0},${0.25 + r() * 0.4})`;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath();
    const ph = r() * 6.28;
    for (let y = 0; y <= h; y += 8) {
      const xx = x + Math.sin(y / 40 + ph) * wav;
      if (y === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  const t = tex(c, { repeat: [3, 1] }); cache.set(key, t); return t;
}

/** Stoffstruktur je Bindungsart als Normalmap. */
export function weaveNormal(weave) {
  const key = `weave${weave}`;
  if (cache.has(key)) return cache.get(key);
  const size = 256, h = new Float32Array(size * size), r = rng(11);
  const noise = noiseField(size, 32, r);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    const i = y * size + x;
    switch (weave) {
      case 'knit': { // Maschen: V-Rippen
        const col = (x % 32) / 32, row = (y % 24) / 24;
        const vshape = Math.abs(col - 0.5) * 2;
        v = Math.sin((row + vshape * 0.5) * Math.PI * 2) * 0.5 + 0.5;
        v *= 0.6 + 0.4 * Math.sin(col * Math.PI);
        break;
      }
      case 'jersey': v = Math.sin((x / 6) * Math.PI) * 0.4 + Math.sin((y / 4) * Math.PI) * 0.15 + 0.5; break;
      case 'twill': v = Math.sin(((x + y) / 8) * Math.PI) * 0.5 + 0.5; break;
      case 'fleece': v = noise[i] * 0.8 + r() * 0.2; break;
      case 'satin': v = Math.sin((x / 3) * Math.PI) * 0.08 + 0.5; break;
      case 'leather': v = noise[i] * 0.6 + (noise[(i * 7) % (size * size)] > 0.7 ? 0.3 : 0); break;
      default: v = (Math.sin((x / 4) * Math.PI) * Math.sin((y / 4) * Math.PI)) * 0.5 + 0.5; // Leinwand
    }
    h[i] = v + (noise[i] - 0.5) * 0.15;
  }
  const strength = weave === 'satin' ? 0.6 : weave === 'knit' ? 3 : 1.8;
  const t = tex(heightToNormal(h, size, strength), { srgb: false, repeat: [10, 10] });
  cache.set(key, t);
  return t;
}

function tinted(app) {
  const base = hexToRgb(app.skin);
  const t = undertoneTint(app.undertone);
  return [base[0] * (1 + t.r), base[1] * (1 + t.g), base[2] * (1 + t.b)];
}
const clamp255 = (v) => Math.max(0, Math.min(255, v));
const rgbStr = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
