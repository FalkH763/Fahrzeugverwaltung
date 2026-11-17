// Projektformat „character-studio“ (Schema 1) mit Erweiterungen atelierV2 und atelierV5.
// Unbekannte Felder werden beim Export unverändert zurückgeschrieben (verlustfreie Rundreise).

import { GARMENTS, getGarment, mapLegacyItem } from './garments.js';
import { resolveFabric, diffFromPreset, getPreset } from './fabrics.js';
import { neutralFace, isHexColor, FACE_KEYS } from './appearance.js';

export const PROJECT_FORMAT = 'character-studio';
export const V5 = 5;

const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

export const DEFAULT_SHAPE = Object.freeze({
  heightCm: 170, weightKg: 63, shoulders: 100, waist: 100, hips: 100,
  bust: 100, glutes: 100, stomach: 100, muscle: 30, thighs: 100, calves: 100,
  arms: 100, legLength: 100, torsoLength: 100, feet: 100, neck: 100, head: 100,
});

export const SHAPE_LIMITS = Object.freeze({
  heightCm: [140, 205, 1, 'Größe cm'], weightKg: [40, 140, 1, 'Gewicht kg'],
  shoulders: [80, 120, 1, 'Schultern'], waist: [75, 130, 1, 'Taille'], hips: [80, 130, 1, 'Hüfte'],
  bust: [70, 140, 1, 'Brust'], glutes: [75, 135, 1, 'Gesäß'], stomach: [80, 140, 1, 'Bauch'],
  muscle: [0, 100, 1, 'Muskulatur'], thighs: [80, 130, 1, 'Oberschenkel'], calves: [80, 125, 1, 'Waden'],
  arms: [80, 125, 1, 'Arme'], legLength: [90, 110, 1, 'Beinlänge'], torsoLength: [90, 110, 1, 'Rumpflänge'],
  feet: [85, 115, 1, 'Füße'], neck: [85, 120, 1, 'Hals'], head: [90, 110, 1, 'Kopf'],
});

/**
 * Hinweise für die beiden Startfiguren, deren Haartextur/Sommersprossen
 * im Schema-1-JSON nicht abgelegt sind (aus den Referenzrenderings übernommen).
 */
const STARTER_HINTS = {
  'atelier-lissy': { hairTexture: 'wavy', hairStyle: 'long', freckles: 18, undertone: 'neutral', ancestry: ['northEurope'] },
  'atelier-clara': { hairTexture: 'curly', hairStyle: 'long', freckles: 62, undertone: 'warm', ancestry: ['northEurope'] },
};

export function defaultFabrics() {
  return Object.fromEntries(GARMENTS.map((g) => [g.id, { preset: g.defaultFabric, overrides: {} }]));
}

export function newProfile({ id, name, age = 30, appearance, shape } = {}) {
  const a = appearance || {};
  return {
    id: id || `figur-${Math.random().toString(36).slice(2, 10)}`,
    name: name || 'Neue Figur',
    age,
    version: 1,
    appearance: {
      skin: a.skin || '#d9a787', skinTone: a.skinTone || null, undertone: a.undertone || 'neutral',
      hairColor: a.hairColor || '#3d2a1e', hairTexture: a.hairTexture || 'wavy', hairStyle: a.hairStyle || 'shoulder',
      eyeColor: a.eyeColor || '#4a3122', freckles: a.freckles ?? 0, face: { ...neutralFace(), ...(a.face || {}) },
      ancestry: a.ancestry || ['mixed'], seed: a.seed ?? null,
    },
    shape: { ...DEFAULT_SHAPE, ...(shape || {}) },
    wear: {
      top: { item: 'tshirt', color: '#d8d2c8' },
      bottom: { item: 'woolTrousers', color: '#3a3f4a' },
      shoes: { item: 'sneaker', color: '#eeeae2' },
      glasses: { item: 'none', color: '#2b2626' },
    },
    fabrics: defaultFabrics(),
    motion: { id: 'idle', intensity: 1, manual: { armLZ: 6, armRZ: 6, elbowL: 5, elbowR: 5, headX: 0, headY: 0, lean: 0 } },
    customFigure: null,
    references: [],
    _raw: null,
  };
}

/** Liest ein Projekt-JSON (Objekt oder String). Liefert { profiles, report, raw }. */
export function loadProject(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  const report = { warnings: [], mapped: [], characters: 0 };
  if (!data || data.format !== PROJECT_FORMAT) throw new Error(`Kein ${PROJECT_FORMAT}-Projekt (format fehlt oder falsch).`);
  if (data.schema !== 1) report.warnings.push(`Unerwartete Schemaversion ${data.schema}; Import wird versucht.`);
  if (!Array.isArray(data.characters)) throw new Error('Projekt enthält keine Liste „characters“.');

  const v2 = data.atelierV2?.figures || {};
  const v5 = data.atelierV5?.figures || {};
  const profiles = data.characters.map((c) => {
    if (!c || typeof c.id !== 'string') throw new Error('Charakter ohne gültige id.');
    const f2 = v2[c.id] || {};
    const f5 = v5[c.id] || {};
    const hints = STARTER_HINTS[c.id] || {};
    const p = newProfile({ id: c.id, name: c.name, age: c.age });
    p.version = c.version ?? 1;

    // Erscheinungsbild
    const ap = p.appearance;
    if (isHexColor(c.skin)) ap.skin = c.skin;
    if (isHexColor(c.hairColor)) ap.hairColor = c.hairColor;
    if (isHexColor(c.eyeColor)) ap.eyeColor = c.eyeColor;
    Object.assign(ap, pickDefined(hints, ['hairTexture', 'hairStyle', 'freckles', 'undertone', 'ancestry']));
    if (c.outfit?.hair === 'short') ap.hairStyle = 'short';
    if (c.body) {
      // Schema-1-Faktoren (≈1) auf Gesichtsregler (0–100) abbilden
      if (typeof c.body.jaw === 'number') ap.face.jaw = clampInt(50 + (c.body.jaw - 1) * 250, 0, 100);
      if (typeof c.body.eyes === 'number') ap.face.eyeSize = clampInt(50 + (c.body.eyes - 1) * 250, 0, 100);
    }
    if (f5.appearance) Object.assign(ap, sanitizeAppearance(f5.appearance));

    // Körperform
    const s = p.shape;
    if (c.body) {
      if (typeof c.body.shoulders === 'number') s.shoulders = Math.round(c.body.shoulders * 100);
      if (typeof c.body.waist === 'number') s.waist = Math.round(c.body.waist * 100);
      if (typeof c.body.hips === 'number') s.hips = Math.round(c.body.hips * 100);
      if (typeof c.body.head === 'number') s.head = Math.round(c.body.head * 100);
    }
    if (f2.shape) for (const [k, v] of Object.entries(f2.shape)) if (k in SHAPE_LIMITS && typeof v === 'number') s[k] = v;
    if (f5.shape) for (const [k, v] of Object.entries(f5.shape)) if (k in SHAPE_LIMITS && typeof v === 'number') s[k] = v;
    clampShape(s);

    // Kleidung: atelierV2.wear bevorzugt, sonst Schema-1-outfit
    for (const slot of ['top', 'bottom']) {
      const src = f2.wear?.[slot] || { item: c.outfit?.[slot], color: c.colors?.[slot] };
      const m = mapLegacyItem(slot, src.item);
      p.wear[slot] = { item: m.id, color: isHexColor(src.color) ? src.color : p.wear[slot].color };
      if (!m.exact) {
        p.wear[slot].legacyItem = src.item;
        report.mapped.push(`${c.name}: ${slot} „${src.item}“ → ${m.id === 'none' ? 'keins' : getGarment(m.id).label}${m.unknown ? ' (unbekannt, Ersatz)' : ''}`);
      }
    }
    const shoes = f2.wear?.shoes || { item: c.outfit?.shoes, color: c.colors?.shoes };
    p.wear.shoes = { item: shoes.item && shoes.item !== 'none' ? 'sneaker' : 'none', color: isHexColor(shoes.color) ? shoes.color : '#eeeae2' };
    const gl = f2.wear?.glasses || { item: c.outfit?.accessory === 'glasses' ? 'round' : 'none', color: c.colors?.accessory };
    p.wear.glasses = { item: gl.item && gl.item !== 'none' ? 'round' : 'none', color: isHexColor(gl.color) ? gl.color : '#2b2626' };
    if (f5.wear) for (const slot of ['top', 'bottom', 'shoes', 'glasses']) if (f5.wear[slot]) p.wear[slot] = { ...p.wear[slot], ...f5.wear[slot] };

    const ignored = Object.entries(f2.wear || {}).filter(([k, v]) => !['top', 'bottom', 'shoes', 'glasses'].includes(k) && v?.item && v.item !== 'none');
    for (const [k, v] of ignored) report.warnings.push(`${c.name}: Slot „${k}“ (${v.item}) ist in V5 nicht modelliert und bleibt nur im JSON erhalten.`);

    // Stoffe
    if (f5.fabrics) {
      for (const g of GARMENTS) {
        const fs = f5.fabrics[g.id];
        if (!fs) continue;
        try { getPreset(fs.preset); p.fabrics[g.id] = { preset: fs.preset, overrides: diffFromPreset(resolveFabric(fs.preset, fs.overrides || {})) }; }
        catch { report.warnings.push(`${c.name}: Stoff für ${g.label} ungültig, Standard verwendet.`); }
      }
    }

    if (f2.motion) p.motion = { ...p.motion, ...clone(f2.motion), manual: { ...p.motion.manual, ...(f2.motion.manual || {}) } };
    if (f5.customFigure && typeof f5.customFigure.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f5.customFigure.sha256)) {
      p.customFigure = clone(f5.customFigure);
    }
    p.references = Array.isArray(c.references) ? c.references : [];
    p._raw = { character: c, v2: f2 };
    report.characters++;
    return p;
  });
  return { profiles, report, raw: data };
}

/** Schreibt ein Projekt-JSON. Unveränderte Originalfelder bleiben erhalten. */
export function saveProject(profiles, raw = null) {
  const out = raw ? clone({ ...raw, characters: undefined }) : {};
  out.format = PROJECT_FORMAT;
  out.schema = 1;
  out.atelierV2 = out.atelierV2 || { version: 2, figures: {} };
  out.atelierV2.figures = out.atelierV2.figures || {};
  out.atelierV5 = { version: V5, figures: {} };
  out.characters = profiles.map((p) => {
    const orig = p._raw?.character ? clone(p._raw.character) : {};
    const c = { ...orig, id: p.id, name: p.name, age: p.age, version: p.version };
    c.skin = p.appearance.skin;
    c.hairColor = p.appearance.hairColor;
    c.eyeColor = p.appearance.eyeColor;
    c.body = {
      ...(orig.body || {}), height: orig.body?.height ?? 1,
      shoulders: p.shape.shoulders / 100, waist: p.shape.waist / 100, hips: p.shape.hips / 100, head: p.shape.head / 100,
      eyes: round2(1 + (p.appearance.face.eyeSize - 50) / 250), jaw: round2(1 + (p.appearance.face.jaw - 50) / 250),
    };
    const legacy = (slot) => p.wear[slot].legacyItem ?? p.wear[slot].item;
    c.outfit = { ...(orig.outfit || {}), top: legacy('top'), bottom: legacy('bottom'), shoes: p.wear.shoes.item, accessory: p.wear.glasses.item !== 'none' ? 'glasses' : (orig.outfit?.accessory === 'glasses' ? 'none' : orig.outfit?.accessory ?? 'none') };
    c.colors = { ...(orig.colors || {}), top: p.wear.top.color, bottom: p.wear.bottom.color, shoes: p.wear.shoes.color, accessory: p.wear.glasses.color };
    c.traits = orig.traits || [];
    c.references = p.references || [];

    const v2 = clone(p._raw?.v2) || {};
    v2.wear = v2.wear || {};
    v2.wear.top = { ...(v2.wear.top || {}), item: legacy('top'), color: p.wear.top.color };
    v2.wear.bottom = { ...(v2.wear.bottom || {}), item: legacy('bottom'), color: p.wear.bottom.color };
    v2.shape = { ...(v2.shape || {}), ...pickDefined(p.shape, Object.keys(p.shape).filter((k) => !['shoulders', 'waist', 'hips', 'head'].includes(k))) };
    v2.motion = clone(p.motion);
    out.atelierV2.figures[p.id] = v2;

    out.atelierV5.figures[p.id] = {
      appearance: clone(p.appearance),
      shape: clone(p.shape),
      wear: clone(p.wear),
      fabrics: Object.fromEntries(Object.entries(p.fabrics).map(([k, v]) => [k, { preset: v.preset, overrides: clone(v.overrides || {}) }])),
      customFigure: p.customFigure ? clone(p.customFigure) : null,
    };
    return c;
  });
  // Reihenfolge: format/schema/characters zuerst für Lesbarkeit
  const { format, schema, characters, ...rest } = out;
  return { format, schema, characters, ...rest };
}

export function fabricState(profile, garmentId) {
  const f = profile.fabrics[garmentId] || { preset: getGarment(garmentId).defaultFabric, overrides: {} };
  return resolveFabric(f.preset, f.overrides);
}

export function setFabricState(profile, garmentId, state) {
  profile.fabrics[garmentId] = { preset: state.preset, overrides: diffFromPreset(state) };
}

function sanitizeAppearance(a) {
  const o = {};
  for (const k of ['skin', 'hairColor', 'eyeColor']) if (isHexColor(a[k])) o[k] = a[k];
  for (const k of ['skinTone', 'undertone', 'hairTexture', 'hairStyle']) if (typeof a[k] === 'string') o[k] = a[k];
  if (typeof a.freckles === 'number') o.freckles = clampInt(a.freckles, 0, 100);
  if (Array.isArray(a.ancestry)) o.ancestry = a.ancestry.filter((x) => typeof x === 'string');
  if (typeof a.seed === 'number') o.seed = a.seed;
  if (a.face && typeof a.face === 'object') {
    o.face = neutralFace();
    for (const k of Object.keys(FACE_KEYS)) if (typeof a.face[k] === 'number') o.face[k] = clampInt(a.face[k], 0, 100);
  }
  return o;
}

export function clampShape(s) {
  for (const [k, [min, max]] of Object.entries(SHAPE_LIMITS)) {
    if (typeof s[k] !== 'number' || !Number.isFinite(s[k])) s[k] = DEFAULT_SHAPE[k];
    s[k] = Math.min(max, Math.max(min, s[k]));
  }
  return s;
}

function pickDefined(o, keys) { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; }
function clampInt(v, a, b) { return Math.round(Math.min(b, Math.max(a, v))); }
function round2(v) { return Math.round(v * 100) / 100; }
