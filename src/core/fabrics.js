// Stoffvorlagen und Stoffmechanik – V5
// Alle Zahlen sind bearbeitbare technische Startwerte dieses Projekts,
// keine gemessenen Datenblätter konkreter Textilien.

/** Grenzen und Einheiten der bearbeitbaren Eigenschaften. */
export const FABRIC_LIMITS = Object.freeze({
  gsm: { min: 40, max: 1200, step: 5, unit: 'g/m²', label: 'Flächengewicht' },
  thicknessMm: { min: 0.1, max: 6, step: 0.05, unit: 'mm', label: 'Dicke' },
  stretchPct: { min: 0, max: 100, step: 1, unit: '%', label: 'Dehnung' },
  bending: { min: 0, max: 100, step: 1, unit: '', label: 'Biegesteifigkeit' },
  damping: { min: 0, max: 100, step: 1, unit: '', label: 'Dämpfung' },
  friction: { min: 0, max: 1, step: 0.01, unit: '', label: 'Reibung' },
  roughness: { min: 0, max: 1, step: 0.01, unit: '', label: 'Oberflächenrauheit' },
});

export const FABRIC_KEYS = Object.freeze(Object.keys(FABRIC_LIMITS));

/** Detailmuster für die prozedurale Normalmap im Browser. */
export const WEAVES = Object.freeze(['plain', 'jersey', 'twill', 'knit', 'fleece', 'satin', 'leather']);

const P = (id, label, gsm, thicknessMm, stretchPct, roughness, bending, damping, friction, weave, sheen = 0) =>
  Object.freeze({ id, label, gsm, thicknessMm, stretchPct, roughness, bending, damping, friction, weave, sheen });

/** Zwölf Stoffvorlagen (Tabelle aus der V5-Spezifikation, ergänzt um Biegung/Dämpfung/Reibung). */
export const FABRIC_PRESETS = Object.freeze([
  P('cotton', 'Baumwolle', 180, 0.6, 8, 0.85, 35, 25, 0.45, 'plain'),
  P('jersey', 'Jersey', 190, 0.7, 35, 0.82, 18, 20, 0.40, 'jersey'),
  P('linen', 'Leinen', 170, 0.6, 4, 0.95, 45, 30, 0.50, 'plain'),
  P('denim', 'Denim', 380, 1.1, 5, 0.90, 70, 35, 0.55, 'twill'),
  P('woolKnit', 'Wollstrick', 330, 2.5, 25, 0.95, 30, 40, 0.60, 'knit', 0.25),
  P('woolWoven', 'Wollgewebe', 260, 0.9, 6, 0.80, 50, 30, 0.50, 'twill', 0.15),
  P('fleece', 'Fleece', 280, 2.2, 18, 1.00, 28, 45, 0.65, 'fleece', 0.35),
  P('satin', 'Satin', 110, 0.3, 5, 0.30, 8, 12, 0.20, 'satin', 0.6),
  P('viscose', 'Viskose', 150, 0.45, 10, 0.60, 10, 15, 0.30, 'plain', 0.2),
  P('softshell', 'Softshell', 300, 1.5, 15, 0.65, 55, 35, 0.45, 'plain'),
  P('polyElastane', 'Polyamid-Elastan', 200, 0.6, 60, 0.42, 12, 18, 0.35, 'jersey', 0.3),
  P('leather', 'Leder', 650, 1.2, 3, 0.52, 85, 40, 0.60, 'leather'),
]);

const PRESET_MAP = new Map(FABRIC_PRESETS.map((p) => [p.id, p]));

export function getPreset(id) {
  const p = PRESET_MAP.get(id);
  if (!p) throw new Error(`Unbekannte Stoffvorlage: ${id}`);
  return p;
}

export function clampProp(key, value) {
  const lim = FABRIC_LIMITS[key];
  if (!lim) throw new Error(`Unbekannte Stoffeigenschaft: ${key}`);
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(lim.max, Math.max(lim.min, n));
}

/**
 * Prüft einen Stoffzustand. Liefert eine Liste deutscher Fehlermeldungen (leer = gültig).
 */
export function validateFabric(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['Stoffzustand fehlt.'];
  if (!PRESET_MAP.has(state.preset)) errors.push(`Unbekannte Stoffvorlage „${state.preset}“.`);
  for (const key of FABRIC_KEYS) {
    const v = state[key];
    const lim = FABRIC_LIMITS[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(`${lim.label}: kein gültiger Zahlenwert.`);
    else if (v < lim.min || v > lim.max) errors.push(`${lim.label}: ${v} liegt außerhalb ${lim.min}–${lim.max} ${lim.unit}`.trim());
  }
  return errors;
}

/** Vollständiger Stoffzustand aus Vorlage + individuellen Überschreibungen. */
export function resolveFabric(presetId, overrides = {}) {
  const p = getPreset(presetId);
  const out = { preset: p.id, weave: p.weave, sheen: p.sheen };
  for (const key of FABRIC_KEYS) {
    const o = overrides[key];
    const c = o === undefined ? null : clampProp(key, o);
    out[key] = c === null ? p[key] : c;
  }
  return out;
}

/** Nur die Werte, die von der Vorlage abweichen – so bleibt das Projekt-JSON schlank. */
export function diffFromPreset(state) {
  const p = getPreset(state.preset);
  const overrides = {};
  for (const key of FABRIC_KEYS) {
    if (Math.abs(state[key] - p[key]) > 1e-9) overrides[key] = state[key];
  }
  return overrides;
}

/**
 * Massenerhaltende Umrechnung.
 * Gesamtmasse [kg] = Meshfläche [m²] × Flächengewicht [g/m²] / 1000.
 * Masse je Simulationsvertex = Gesamtmasse / Vertexanzahl,
 * damit eine feinere Unterteilung das Gesamtgewicht nicht erhöht.
 */
export function clothMass({ areaM2, gsm, vertexCount }) {
  if (!(areaM2 > 0)) throw new Error('Meshfläche muss größer als 0 sein.');
  if (!(gsm > 0)) throw new Error('Flächengewicht muss größer als 0 sein.');
  if (!Number.isInteger(vertexCount) || vertexCount < 1) throw new Error('Vertexanzahl muss eine positive ganze Zahl sein.');
  const totalKg = (areaM2 * gsm) / 1000;
  return { totalKg, vertexMassKg: totalKg / vertexCount };
}

/**
 * Abbildung der UI-Werte auf Blender-4.x-Stoffparameter.
 * Heuristische Tuningwerte, keine SI-Angaben (siehe Dokumentation).
 */
export function toBlenderCloth(state, { areaM2, vertexCount }) {
  const { totalKg, vertexMassKg } = clothMass({ areaM2, gsm: state.gsm, vertexCount });
  // Dehnung → Zug-/Drucksteifigkeit: wenig Dehnung = steif. Bereich ca. 4–80.
  const tension = round(clamp(400 / (state.stretchPct + 2), 4, 80), 3);
  const shear = round(tension * 0.5, 3);
  // Biegeregler 0–100 logarithmisch auf 0,05–500.
  const bending = round(0.05 * Math.pow(10, state.bending / 25), 4);
  // Dämpfung 0–100 → Blender 0–50.
  const damping = round((state.damping / 100) * 50, 3);
  const thicknessM = state.thicknessMm / 1000;
  return {
    totalMassKg: round(totalKg, 6),
    mass: round(vertexMassKg, 8),
    tension_stiffness: tension,
    compression_stiffness: tension,
    shear_stiffness: shear,
    bending_stiffness: bending,
    tension_damping: damping,
    compression_damping: damping,
    shear_damping: damping,
    bending_damping: round(damping * 0.1, 4),
    air_damping: 1,
    quality: 8,
    collision: {
      // Kollisionsabstand aus Dicke, mindestens 3 mm Startabstand
      distance_min: round(Math.max(0.003, thicknessM * 1.5), 5),
      self_distance_min: round(Math.max(0.0015, thicknessM), 5),
      use_self_collision: true,
      // Reibung 0–1 → Blender-Kollisionsreibung 0–20 (Tuningwert)
      friction: round(state.friction * 20, 3),
    },
    solidify_thickness: round(thicknessM, 6),
  };
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function round(v, d) { const f = 10 ** d; return Math.round(v * f) / f; }
