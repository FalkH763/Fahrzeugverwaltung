// Erscheinungsbild und Herkunftsvorlagen.
//
// Die Vorlagen sind Startpunkte zum schnellen Anlegen unterschiedlicher Figuren.
// Innerhalb jeder Herkunftsregion ist die reale Variation sehr groß; keine Vorlage
// beschreibt „den typischen“ Menschen einer Gruppe. Jede Eigenschaft bleibt im
// Editor frei einstellbar, Vorlagen lassen sich mischen und es werden immer
// zufällige Varianten aus breiten Bereichen erzeugt statt eines Einheitsgesichts.

/** Zehnstufige Hauttonskala (hell → dunkel), eigene Werte dieses Projekts. */
export const SKIN_TONES = Object.freeze([
  { id: 'st1', label: 'Ton 1', hex: '#f6e3d6' },
  { id: 'st2', label: 'Ton 2', hex: '#efd2bf' },
  { id: 'st3', label: 'Ton 3', hex: '#e7bea9' },
  { id: 'st4', label: 'Ton 4', hex: '#d9a787' },
  { id: 'st5', label: 'Ton 5', hex: '#c58c69' },
  { id: 'st6', label: 'Ton 6', hex: '#a96f4e' },
  { id: 'st7', label: 'Ton 7', hex: '#8d5639' },
  { id: 'st8', label: 'Ton 8', hex: '#6f4029' },
  { id: 'st9', label: 'Ton 9', hex: '#55301f' },
  { id: 'st10', label: 'Ton 10', hex: '#3b2116' },
]);

export const UNDERTONES = Object.freeze(['kühl', 'neutral', 'warm', 'oliv']);
export const HAIR_TEXTURES = Object.freeze([
  { id: 'straight', label: 'Glatt' },
  { id: 'wavy', label: 'Wellig' },
  { id: 'curly', label: 'Lockig' },
  { id: 'coily', label: 'Kraus / Coily' },
]);
export const HAIR_STYLES = Object.freeze([
  { id: 'long', label: 'Lang offen' },
  { id: 'shoulder', label: 'Schulterlang' },
  { id: 'short', label: 'Kurz' },
  { id: 'bun', label: 'Dutt' },
  { id: 'afro', label: 'Volumen / Afro' },
  { id: 'braids', label: 'Zöpfe / Braids' },
  { id: 'buzz', label: 'Sehr kurz' },
]);

/** Gesichtsregler: 0–100, 50 = neutral. */
export const FACE_KEYS = Object.freeze({
  noseWidth: 'Nasenbreite', noseBridge: 'Nasenrücken', noseLength: 'Nasenlänge',
  lipFullness: 'Lippenfülle', lidFold: 'Lidfalte / Epikanthus', eyeSize: 'Augengröße',
  eyeSpacing: 'Augenabstand', cheekbones: 'Wangenknochen', jaw: 'Kieferbreite',
  chin: 'Kinn', browRidge: 'Brauenbogen', faceLength: 'Gesichtslänge',
});

export const neutralFace = () => Object.fromEntries(Object.keys(FACE_KEYS).map((k) => [k, 50]));

/**
 * Herkunftsvorlagen: Bereiche statt Einzelwerte.
 * skin: Indizes in SKIN_TONES (inklusive), face: [min, max] je Regler.
 */
const R = (a, b) => [a, b];
export const ANCESTRY_PRESETS = Object.freeze([
  {
    id: 'northEurope', label: 'Nordeuropäisch', skin: R(0, 2), undertones: ['kühl', 'neutral'],
    hair: ['#e5cf9f', '#c9a26b', '#9e7954', '#6b4a32', '#b86a3c'], textures: ['straight', 'wavy'],
    eyes: ['#7f9bb3', '#798994', '#6f8466', '#6a5040'], freckles: R(0, 60),
    face: { noseWidth: R(35, 55), noseBridge: R(50, 75), lipFullness: R(30, 55), lidFold: R(0, 15), cheekbones: R(40, 65) },
  },
  {
    id: 'southEurope', label: 'Südeuropäisch / Mittelmeerraum', skin: R(1, 4), undertones: ['neutral', 'warm', 'oliv'],
    hair: ['#2a1b14', '#3d2a1e', '#5a3b26', '#7a5435'], textures: ['straight', 'wavy', 'curly'],
    eyes: ['#4a3122', '#6a5040', '#6f8466', '#7f9bb3'], freckles: R(0, 20),
    face: { noseWidth: R(40, 60), noseBridge: R(50, 80), lipFullness: R(40, 65), lidFold: R(0, 15), cheekbones: R(45, 65) },
  },
  {
    id: 'mena', label: 'Nahost / Nordafrika', skin: R(2, 6), undertones: ['warm', 'oliv', 'neutral'],
    hair: ['#1d130e', '#2a1b14', '#3d2a1e', '#5a3b26'], textures: ['wavy', 'curly', 'straight'],
    eyes: ['#3a2418', '#4a3122', '#6a5040', '#6f8466'], freckles: R(0, 15),
    face: { noseWidth: R(40, 62), noseBridge: R(55, 85), lipFullness: R(40, 68), lidFold: R(0, 20), cheekbones: R(45, 70) },
  },
  {
    id: 'westAfrica', label: 'Westafrikanisch', skin: R(6, 9), undertones: ['warm', 'neutral', 'kühl'],
    hair: ['#120c09', '#1d130e', '#2a1b14'], textures: ['coily', 'curly'],
    eyes: ['#24160f', '#3a2418', '#4a3122'], freckles: R(0, 10),
    face: { noseWidth: R(55, 80), noseBridge: R(25, 55), lipFullness: R(60, 85), lidFold: R(0, 20), cheekbones: R(50, 75) },
  },
  {
    id: 'eastAfrica', label: 'Ostafrikanisch', skin: R(6, 9), undertones: ['warm', 'neutral'],
    hair: ['#120c09', '#1d130e', '#2a1b14'], textures: ['coily', 'curly'],
    eyes: ['#24160f', '#3a2418', '#4a3122'], freckles: R(0, 10),
    face: { noseWidth: R(45, 70), noseBridge: R(40, 70), lipFullness: R(50, 80), lidFold: R(0, 20), cheekbones: R(55, 80), faceLength: R(50, 75) },
  },
  {
    id: 'southAsia', label: 'Südasiatisch', skin: R(3, 8), undertones: ['warm', 'oliv', 'neutral'],
    hair: ['#120c09', '#1d130e', '#2a1b14', '#3d2a1e'], textures: ['straight', 'wavy', 'curly'],
    eyes: ['#24160f', '#3a2418', '#4a3122', '#6a5040'], freckles: R(0, 10),
    face: { noseWidth: R(45, 65), noseBridge: R(45, 75), lipFullness: R(45, 70), lidFold: R(0, 25), cheekbones: R(45, 70) },
  },
  {
    id: 'eastAsia', label: 'Ostasiatisch', skin: R(1, 4), undertones: ['neutral', 'warm', 'kühl'],
    hair: ['#120c09', '#1d130e', '#2a1b14'], textures: ['straight', 'wavy'],
    eyes: ['#24160f', '#3a2418', '#4a3122'], freckles: R(0, 15),
    face: { noseWidth: R(40, 62), noseBridge: R(20, 50), lipFullness: R(40, 65), lidFold: R(45, 85), cheekbones: R(55, 80), browRidge: R(20, 45) },
  },
  {
    id: 'southeastAsia', label: 'Südostasiatisch', skin: R(3, 6), undertones: ['warm', 'oliv', 'neutral'],
    hair: ['#120c09', '#1d130e', '#2a1b14'], textures: ['straight', 'wavy'],
    eyes: ['#24160f', '#3a2418', '#4a3122'], freckles: R(0, 10),
    face: { noseWidth: R(50, 70), noseBridge: R(20, 50), lipFullness: R(50, 72), lidFold: R(30, 70), cheekbones: R(50, 75) },
  },
  {
    id: 'indigenousAmericas', label: 'Indigene Amerikas', skin: R(3, 7), undertones: ['warm', 'oliv'],
    hair: ['#120c09', '#1d130e', '#2a1b14'], textures: ['straight', 'wavy'],
    eyes: ['#24160f', '#3a2418', '#4a3122'], freckles: R(0, 10),
    face: { noseWidth: R(45, 70), noseBridge: R(45, 80), lipFullness: R(40, 65), lidFold: R(25, 60), cheekbones: R(60, 85) },
  },
  {
    id: 'latinAmerica', label: 'Lateinamerikanisch (gemischt)', skin: R(1, 8), undertones: ['warm', 'oliv', 'neutral'],
    hair: ['#120c09', '#2a1b14', '#3d2a1e', '#5a3b26', '#7a5435'], textures: ['straight', 'wavy', 'curly', 'coily'],
    eyes: ['#24160f', '#3a2418', '#4a3122', '#6a5040', '#6f8466'], freckles: R(0, 25),
    face: { noseWidth: R(40, 72), noseBridge: R(35, 75), lipFullness: R(40, 78), lidFold: R(0, 45), cheekbones: R(45, 75) },
  },
  {
    id: 'pacific', label: 'Pazifik / Polynesien', skin: R(4, 7), undertones: ['warm', 'neutral'],
    hair: ['#120c09', '#1d130e', '#2a1b14', '#3d2a1e'], textures: ['wavy', 'curly', 'straight'],
    eyes: ['#24160f', '#3a2418', '#4a3122'], freckles: R(0, 10),
    face: { noseWidth: R(55, 78), noseBridge: R(30, 60), lipFullness: R(55, 80), lidFold: R(10, 40), cheekbones: R(55, 80) },
  },
  {
    id: 'mixed', label: 'Frei gemischt', skin: R(0, 9), undertones: [...UNDERTONES],
    hair: ['#e5cf9f', '#9e7954', '#a6522f', '#5a3b26', '#2a1b14', '#120c09', '#bfbfbf'],
    textures: ['straight', 'wavy', 'curly', 'coily'],
    eyes: ['#7f9bb3', '#6f8466', '#6a5040', '#4a3122', '#24160f'], freckles: R(0, 40),
    face: {},
  },
]);

const PRESETS = new Map(ANCESTRY_PRESETS.map((p) => [p.id, p]));
export const getAncestry = (id) => PRESETS.get(id) || PRESETS.get('mixed');

/** Kleiner deterministischer Zufallsgenerator (mulberry32), damit Varianten reproduzierbar sind. */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const within = (r, [a, b]) => Math.round(a + r() * (b - a));

/**
 * Erzeugt ein vollständiges Erscheinungsbild aus einer oder mehreren Vorlagen.
 * @param {string[]} ids  Vorlagen; bei mehreren werden die Bereiche gemischt.
 * @param {number} seed
 */
export function generateAppearance(ids, seed = Date.now()) {
  const r = rng(seed);
  const presets = (ids && ids.length ? ids : ['mixed']).map(getAncestry);
  const src = () => pick(r, presets);
  const skinP = src();
  const skinIndex = within(r, skinP.skin);
  const face = neutralFace();
  for (const key of Object.keys(face)) {
    const ranges = presets.map((p) => p.face[key]).filter(Boolean);
    // Breite Grundvariation 35–65, enger nur, wenn eine Vorlage einen Bereich vorgibt
    const range = ranges.length ? pick(r, ranges) : [35, 65];
    face[key] = within(r, range);
  }
  const textures = src().textures;
  const texture = pick(r, textures);
  const styleChoices = texture === 'coily' ? ['afro', 'braids', 'short', 'bun', 'buzz'] : ['long', 'shoulder', 'short', 'bun'];
  return {
    ancestry: presets.map((p) => p.id),
    seed,
    skin: SKIN_TONES[skinIndex].hex,
    skinTone: SKIN_TONES[skinIndex].id,
    undertone: pick(r, src().undertones),
    hairColor: pick(r, src().hair),
    hairTexture: texture,
    hairStyle: pick(r, styleChoices),
    eyeColor: pick(r, src().eyes),
    freckles: within(r, src().freckles),
    face,
  };
}

/** Feine Hautton-Verschiebung je Unterton (für Material und Textur). */
export function undertoneTint(undertone) {
  switch (undertone) {
    case 'kühl': return { r: -0.01, g: -0.005, b: 0.02 };
    case 'warm': return { r: 0.02, g: 0.005, b: -0.02 };
    case 'oliv': return { r: -0.005, g: 0.015, b: -0.015 };
    default: return { r: 0, g: 0, b: 0 };
  }
}

export function isHexColor(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }
