// Charakteratelier V5 – Oberfläche und Ablauf.
import * as THREE from 'three';
import { loadProject, saveProject, newProfile, SHAPE_LIMITS, fabricState, setFabricState, DEFAULT_SHAPE } from './core/project.js';
import { GARMENTS, getGarment, garmentsForSlot } from './core/garments.js';
import { FABRIC_PRESETS, FABRIC_LIMITS, FABRIC_KEYS, resolveFabric, toBlenderCloth, clothMass } from './core/fabrics.js';
import { ANCESTRY_PRESETS, SKIN_TONES, UNDERTONES, HAIR_TEXTURES, HAIR_STYLES, FACE_KEYS, generateAppearance } from './core/appearance.js';
import { validateGlb, sha256Hex, GlbError, MAX_GLB_BYTES } from './core/glbValidate.js';
import { buildClothJob, clothJobFilename } from './core/clothJob.js';
import * as store from './core/storage.js';

const $ = (s) => document.querySelector(s);
const STORAGE_KEY = 'charakteratelier.v5.projekt';
const STARTER_URL = `${import.meta.env.BASE_URL}beispiele/Lissy_und_Clara_Startprojekt.json`;

const state = {
  profiles: [], raw: null, activeId: null, tab: 'figuren', fabricGarment: 'tshirt',
  ancestrySel: ['northEurope'], build: 'mittel', stage: null, figure: null, custom: null, gl: false,
  R: null, // Render-Module (nur mit WebGL geladen)
};

// ---------- DOM-Helfer ----------------------------------------------------------------
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}
function slider(label, value, [min, max, step], onInput, fmt = (v) => v) {
  const out = el('output', {}, fmt(value));
  const input = el('input', { type: 'range', min, max, step, value, 'aria-label': label });
  input.addEventListener('input', () => { const v = Number(input.value); out.textContent = fmt(v); onInput(v); });
  return el('div', { class: 'row' }, el('label', {}, label), input, out);
}
function colorRow(label, value, onInput) {
  const input = el('input', { type: 'color', value, 'aria-label': label });
  input.addEventListener('input', () => onInput(input.value));
  return el('div', { class: 'row two' }, el('label', {}, label), input);
}
function selectRow(label, value, options, onChange) {
  const s = el('select', { 'aria-label': label }, options.map(([v, t]) => el('option', { value: v, selected: v === value }, t)));
  s.addEventListener('change', () => onChange(s.value));
  return el('div', { class: 'row two' }, el('label', {}, label), s);
}
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.classList.toggle('err', err); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), err ? 6000 : 2800);
}
function download(name, data, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const fmtMiB = (b) => `${(b / 1048576).toFixed(2)} MiB`;

// ---------- Projektzustand --------------------------------------------------------------
const active = () => state.profiles.find((p) => p.id === state.activeId) || state.profiles[0];

let persistTimer;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saveProject(state.profiles, state.raw))); }
    catch (e) { toast(`Lokales Speichern fehlgeschlagen: ${e.message}`, true); }
  }, 400);
}

function applyProject(data) {
  const { profiles, report, raw } = loadProject(data);
  state.profiles = profiles; state.raw = raw;
  state.activeId = profiles[0]?.id;
  return report;
}

// ---------- Ansicht ----------------------------------------------------------------------
let rebuildQueued = false;
function scheduleRebuild() {
  if (rebuildQueued) return;
  rebuildQueued = true;
  requestAnimationFrame(() => { rebuildQueued = false; showActive(); });
}

async function showActive() {
  const p = active();
  if (!p) return;
  $('#figureName').textContent = `${p.name} · ${p.age} J. · ${p.customFigure ? `Eigene Figur: ${p.customFigure.name}` : 'Parametrische Basisfigur (Proxy)'}`;
  $('#badge').textContent = `ID: ${p.name.toUpperCase()}`;
  if (!state.gl) return;
  const { Figure, applyPose } = state.R;
  if (p.customFigure) {
    if (state.custom?.sha256 === p.customFigure.sha256) { applyCustomAppearance(p); return; }
    disposeFigure();
    await loadCustom(p);
    return;
  }
  disposeFigure();
  const t0 = performance.now();
  state.figure = new Figure(p);
  state.stage.setFigure(state.figure.root);
  state.kitPlayer = null;
  if (state.kitPack) {
    try { state.kitPlayer = new state.R.StudioPosePlayer(state.figure, state.kitPack, { positionScale: p.shape.heightCm / 170 }); }
    catch (e) { console.warn(e); }
  }
  animateBase(p, 0);
  state.lastBuildMs = Math.round(performance.now() - t0);
}

/** Basisfigur bewegen: eigene Moves oder MotionKit-Einträge („kit:<id>“). */
function animateBase(p, t) {
  const m = p.motion;
  if (m.id?.startsWith('kit:') && state.kitPlayer) {
    try {
      state.kitPlayer.apply(m.id.slice(4), t * (m.speed ?? 1), { strength: Math.min(1.5, m.intensity ?? 1), mirror: !!m.mirror });
      return;
    } catch (e) { console.warn(e); }
  }
  state.R.applyPose(state.figure, m.id?.startsWith('kit:') ? { ...m, id: 'idle' } : m, t);
}

function disposeFigure() {
  if (state.figure) { state.figure.dispose(); state.figure = null; }
  if (state.custom) { state.custom.mixer?.stopAllAction(); state.custom = null; }
  state.stage?.setFigure(null);
}

async function loadCustom(p) {
  const rec = await store.getFigure(p.customFigure.sha256).catch(() => null);
  if (!rec) {
    toast(`„${p.customFigure.name}“ ist in diesem Browser nicht gespeichert. Bitte die GLB erneut importieren.`, true);
    return;
  }
  try {
    const res = await state.R.loadGlb(rec.bytes.buffer ? rec.bytes.buffer.slice(rec.bytes.byteOffset, rec.bytes.byteOffset + rec.bytes.byteLength) : rec.bytes, p.shape.heightCm / 100);
    const mixer = new THREE.AnimationMixer(res.scene);
    const realism = state.R.prepareRealistic(res.scene);
    state.custom = { sha256: p.customFigure.sha256, ...res, materials: realism.map((e) => e.material), realism, mixer, action: null };
    applyMaterialOverrides(p);
    applyCustomAppearance(p);
    state.stage.setFigure(res.scene);
    playCustomClip(p.motion.id);
    if (state.tab === 'import' || state.tab === 'bewegung') renderTab();
  } catch (e) {
    toast(`Laden fehlgeschlagen: ${e.message}`, true);
  }
}

function playCustomClip(id) {
  const c = state.custom;
  if (!c) return;
  c.mixer.stopAllAction();
  const name = id?.startsWith('import:') ? id.slice(7) : null;
  const clip = name && c.clips.find((k) => k.name === name);
  if (clip) { c.action = c.mixer.clipAction(clip); c.action.play(); }
}

function applyCustomAppearance(p) {
  if (!state.custom?.realism) return 0;
  const cf = p.customFigure || {};
  const n = state.R.applyAppearance(state.custom.realism, p.appearance, { skin: !!cf.toneSkin, hair: !!cf.toneHair });
  if (!cf.toneSkin && !cf.toneHair) applyMaterialOverrides(p);
  return n;
}

function applyMaterialOverrides(p) {
  const ov = p.customFigure?.materialOverrides || {};
  for (const m of state.custom?.materials || []) {
    const o = ov[m.name];
    if (!o) continue;
    if (o.color && m.color) m.color.set(o.color);
    if (typeof o.roughness === 'number' && 'roughness' in m) m.roughness = o.roughness;
    m.needsUpdate = true;
  }
}

// ---------- Tabs -----------------------------------------------------------------------
const TABS = [
  ['figuren', 'Figuren'], ['erscheinung', 'Erscheinung'], ['koerper', 'Körper'],
  ['kleidung', 'Kleidung & Stoff'], ['import', 'Eigene Figur'], ['bewegung', 'Bewegung'], ['projekt', 'Projekt'],
];

function renderTabs() {
  const nav = $('#tabs');
  nav.replaceChildren(...TABS.map(([id, label]) => el('button', { class: state.tab === id ? 'on' : '', onclick: () => { state.tab = id; renderTabs(); renderTab(); } }, label)));
}

function renderTab() {
  const body = $('#tabbody');
  const p = active();
  if (!p) { body.replaceChildren(el('p', { class: 'note' }, 'Kein Projekt geladen.')); return; }
  const r = { figuren: tabFiguren, erscheinung: tabErscheinung, koerper: tabKoerper, kleidung: tabKleidung, import: tabImport, bewegung: tabBewegung, projekt: tabProjekt }[state.tab];
  body.replaceChildren(...[].concat(r(p)).filter((x) => x !== null && x !== undefined && x !== false));
}

function changed({ rebuild = true, tabs = false } = {}) {
  persist();
  if (rebuild) scheduleRebuild();
  if (tabs) renderTab();
}

// --- Figuren ---
const BUILDS = {
  schmal: { weightKg: -9, muscle: 15, bust: 85, hips: 95, shoulders: 96 },
  mittel: { weightKg: 0, muscle: 30, bust: 100, hips: 100, shoulders: 100 },
  athletisch: { weightKg: 4, muscle: 70, bust: 92, hips: 98, shoulders: 106 },
  kraeftig: { weightKg: 18, muscle: 35, bust: 115, hips: 112, shoulders: 104, stomach: 115 },
  maskulin: { weightKg: 10, muscle: 50, bust: 72, hips: 92, shoulders: 112, waist: 104 },
};

function tabFiguren(p) {
  const list = el('div', { class: 'list' }, state.profiles.map((q) => el('button', {
    class: `fig ${q.id === p.id ? 'on' : ''}`,
    onclick: () => { state.activeId = q.id; changed({ tabs: true }); },
  }, el('span', { class: 'swatch', style: `background:${q.appearance.skin}` }),
  el('span', { class: 'swatch', style: `background:${q.appearance.hairColor}` }),
  el('span', {}, el('strong', {}, q.name), ` · ${q.age} J.`, q.customFigure ? ' · GLB' : ''))));

  const nameIn = el('input', { type: 'text', value: p.name, 'aria-label': 'Name' });
  nameIn.addEventListener('change', () => { p.name = nameIn.value.trim() || p.name; changed({ rebuild: true, tabs: true }); });
  const ageIn = el('input', { type: 'number', min: 1, max: 110, value: p.age, 'aria-label': 'Alter' });
  ageIn.addEventListener('change', () => { p.age = Math.max(1, Math.min(110, Number(ageIn.value) || p.age)); changed({ tabs: true }); });

  const chips = el('div', { class: 'chips' }, ANCESTRY_PRESETS.map((a) => el('button', {
    class: `chip ${state.ancestrySel.includes(a.id) ? 'on' : ''}`,
    onclick: () => {
      const i = state.ancestrySel.indexOf(a.id);
      if (i >= 0) state.ancestrySel.splice(i, 1); else if (state.ancestrySel.length < 3) state.ancestrySel.push(a.id);
      else toast('Bis zu drei Vorlagen lassen sich mischen.');
      renderTab();
    },
  }, a.label)));
  const newName = el('input', { type: 'text', placeholder: 'Name der neuen Figur', 'aria-label': 'Name der neuen Figur' });
  const newAge = el('input', { type: 'number', min: 18, max: 90, value: 32, 'aria-label': 'Alter' });
  const newH = el('input', { type: 'number', min: 140, max: 205, value: 170, 'aria-label': 'Größe in cm' });

  return [
    el('h3', {}, 'Figuren im Projekt'), list,
    el('div', { class: 'btns' },
      el('button', { class: 'btn', onclick: () => duplicate(p) }, 'Duplizieren'),
      el('button', { class: 'btn danger', disabled: state.profiles.length < 2, onclick: () => removeProfile(p) }, 'Löschen')),
    el('h3', {}, 'Aktive Figur'),
    el('div', { class: 'row two' }, el('label', {}, 'Name'), nameIn),
    el('div', { class: 'row two' }, el('label', {}, 'Alter'), ageIn),
    p.appearance.seed !== null && p.appearance.seed !== undefined ? el('div', { class: 'btns' },
      el('button', { class: 'btn', onclick: () => reroll(p) }, 'Neue Variante (gleiche Vorlagen)')) : null,
    el('h3', {}, 'Neue Figur aus Herkunftsvorlagen'),
    el('p', { class: 'note' }, 'Vorlagen sind Startpunkte mit breiten Variationsbereichen, keine Typen. Bis zu drei lassen sich mischen; jedes Merkmal bleibt danach frei editierbar.'),
    chips,
    el('div', { class: 'row two' }, el('label', {}, 'Name'), newName),
    el('div', { class: 'row two' }, el('label', {}, 'Alter'), newAge),
    el('div', { class: 'row two' }, el('label', {}, 'Größe cm'), newH),
    selectRow('Körperbau', state.build, [['schmal', 'Schmal'], ['mittel', 'Mittel'], ['athletisch', 'Athletisch'], ['kraeftig', 'Kräftig'], ['maskulin', 'Maskulin']], (v) => { state.build = v; }),
    el('div', { class: 'btns' }, el('button', {
      class: 'btn primary', onclick: () => createFigure({ name: newName.value.trim(), age: Number(newAge.value) || 32, heightCm: Number(newH.value) || 170 }),
    }, 'Figur erzeugen')),
  ];
}

function createFigure({ name, age, heightCm }) {
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
  const appearance = generateAppearance(state.ancestrySel, seed);
  const b = BUILDS[state.build] || BUILDS.mittel;
  const h = Math.max(140, Math.min(205, heightCm));
  const bmiW = Math.round(21.5 * (h / 100) ** 2);
  const shape = { ...DEFAULT_SHAPE, heightCm: h, weightKg: bmiW + (b.weightKg || 0), muscle: b.muscle, bust: b.bust, hips: b.hips, shoulders: b.shoulders, stomach: b.stomach ?? 100, waist: b.waist ?? 100 };
  const labels = state.ancestrySel.map((id) => ANCESTRY_PRESETS.find((a) => a.id === id)?.label).join(' + ');
  const p = newProfile({ name: name || `Figur ${state.profiles.length + 1}`, age, appearance, shape });
  p.wear.top.color = ['#d8d2c8', '#6b7a6b', '#3a3f4a', '#8a5a4a', '#c9b79c'][seed % 5];
  state.profiles.push(p);
  state.activeId = p.id;
  toast(`${p.name} erzeugt (${labels || 'gemischt'}).`);
  changed({ tabs: true });
}

function reroll(p) {
  const appearance = generateAppearance(p.appearance.ancestry, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
  p.appearance = appearance;
  changed({ tabs: true });
}

function duplicate(p) {
  const c = JSON.parse(JSON.stringify({ ...p, _raw: null }));
  c.id = `figur-${Math.random().toString(36).slice(2, 10)}`;
  c.name = `${p.name} (Kopie)`;
  c._raw = null;
  state.profiles.push(c); state.activeId = c.id;
  changed({ tabs: true });
}

function removeProfile(p) {
  if (!confirm(`„${p.name}“ aus dem Projekt entfernen? Eine importierte GLB bleibt im lokalen Speicher.`)) return;
  state.profiles = state.profiles.filter((q) => q !== p);
  state.activeId = state.profiles[0]?.id;
  changed({ tabs: true });
}

// --- Erscheinung ---
function tabErscheinung(p) {
  const a = p.appearance;
  const tones = el('div', { class: 'tones' }, SKIN_TONES.map((t) => el('button', {
    class: a.skin.toLowerCase() === t.hex ? 'on' : '', style: `background:${t.hex}`, title: t.label, 'aria-label': `Hautton ${t.label}`,
    onclick: () => { a.skin = t.hex; a.skinTone = t.id; changed({ tabs: true }); },
  })));
  const tex = el('div', { class: 'chips' }, HAIR_TEXTURES.map((t) => el('button', {
    class: `chip ${a.hairTexture === t.id ? 'on' : ''}`, onclick: () => { a.hairTexture = t.id; changed({ tabs: true }); },
  }, t.label)));
  return [
    p.customFigure ? el('p', { class: 'warn' }, 'Importierte Figur: Hautton und Haarfarbe wirken, wenn unter „Eigene Figur“ die Schalter aktiv sind. Gesichtsregler gelten nur für die Basisfigur.') : el('p', { class: 'note' }, 'Die parametrische Basisfigur ist ein Proxy zum Konfigurieren. Fotorealistische Figuren entstehen über einen realistischen GLB-Master (Tab „Eigene Figur“).'),
    el('h3', {}, 'Haut'), tones,
    colorRow('Hautton frei', a.skin, (v) => { a.skin = v; a.skinTone = null; changed(); }),
    selectRow('Unterton', a.undertone, UNDERTONES.map((u) => [u, u[0].toUpperCase() + u.slice(1)]), (v) => { a.undertone = v; changed(); }),
    slider('Sommersprossen', a.freckles, [0, 100, 1], (v) => { a.freckles = v; changed(); }),
    el('h3', {}, 'Haare'),
    colorRow('Haarfarbe', a.hairColor, (v) => { a.hairColor = v; changed(); }),
    el('div', { class: 'row two' }, el('label', {}, 'Struktur'), tex),
    selectRow('Frisur', a.hairStyle, HAIR_STYLES.map((s) => [s.id, s.label]), (v) => { a.hairStyle = v; changed(); }),
    el('h3', {}, 'Augen'),
    colorRow('Augenfarbe', a.eyeColor, (v) => { a.eyeColor = v; changed(); }),
    el('h3', {}, 'Gesicht'),
    ...Object.entries(FACE_KEYS).map(([k, label]) => slider(label, a.face[k], [0, 100, 1], (v) => { a.face[k] = v; changed(); })),
    el('div', { class: 'btns' }, el('button', { class: 'btn', onclick: () => state.stage?.focus('face', p.shape.heightCm / 100) }, 'Gesicht heranzoomen')),
  ];
}

// --- Körper ---
function tabKoerper(p) {
  const s = p.shape;
  const A = state.figure?.A;
  return [
    el('h3', {}, 'Körperform'),
    ...Object.entries(SHAPE_LIMITS).map(([k, [min, max, step, label]]) => slider(label, s[k], [min, max, step], (v) => { s[k] = v; changed(); }, (v) => (k === 'heightCm' ? `${v}` : k === 'weightKg' ? `${v}` : `${v}%`))),
    A ? el('p', { class: 'note' }, `BMI ${A.bmi.toFixed(1)} · Schritthöhe ${(A.crotchY * 100).toFixed(0)} cm · Schulterbreite ${(A.shoulderX * 200).toFixed(0)} cm · ${state.figure.stats.triangles.toLocaleString('de-DE')} Dreiecke · Aufbau ${state.lastBuildMs ?? '–'} ms`) : null,
    el('div', { class: 'btns' }, el('button', { class: 'btn', onclick: () => { Object.assign(p.shape, { ...DEFAULT_SHAPE, heightCm: s.heightCm, weightKg: s.weightKg }); changed({ tabs: true }); } }, 'Proportionen zurücksetzen')),
  ];
}

// --- Kleidung & Stoff ---
function tabKleidung(p) {
  const w = p.wear;
  const opt = (slot) => [['none', 'Keins'], ...garmentsForSlot(slot).map((g) => [g.id, g.label])];
  const parts = [
    el('h3', {}, 'Outfit'),
    selectRow('Oberteil', w.top.item, opt('top'), (v) => { w.top.item = v; delete w.top.legacyItem; changed({ tabs: true }); }),
    colorRow('Farbe Oberteil', w.top.color, (v) => { w.top.color = v; changed(); }),
    selectRow('Unterteil', w.bottom.item, opt('bottom'), (v) => { w.bottom.item = v; delete w.bottom.legacyItem; changed({ tabs: true }); }),
    colorRow('Farbe Unterteil', w.bottom.color, (v) => { w.bottom.color = v; changed(); }),
    selectRow('Schuhe', w.shoes.item, [['none', 'Barfuß'], ['sneaker', 'Sneaker']], (v) => { w.shoes.item = v; changed(); }),
    colorRow('Farbe Schuhe', w.shoes.color, (v) => { w.shoes.color = v; changed(); }),
    selectRow('Brille', w.glasses.item, [['none', 'Keine'], ['round', 'Rund']], (v) => { w.glasses.item = v; changed(); }),
    (w.top.legacyItem || w.bottom.legacyItem) ? el('p', { class: 'note' }, `Aus älterem Projekt zugeordnet: ${[w.top.legacyItem, w.bottom.legacyItem].filter(Boolean).join(', ')} → nächstliegendes V5-Modell. Original-ID bleibt im Export erhalten.`) : null,
  ];

  // Stoffbearbeitung
  const gid = state.fabricGarment;
  const g = getGarment(gid);
  const f = fabricState(p, gid);
  const set = (key, v, { visual = false, geometry = false } = {}) => {
    const next = { ...fabricState(p, gid), [key]: v };
    setFabricState(p, gid, next);
    persist();
    if (geometry) scheduleRebuild();
    else if (visual) state.figure?.refreshFabric(gid);
    updateInfo();
  };
  const worn = w.top.item === gid || w.bottom.item === gid;
  const info = el('div', { class: 'note' });
  const updateInfo = () => {
    const st = state.figure?.stats.garments?.[gid];
    const cur = fabricState(p, gid);
    if (st && worn) {
      const m = clothMass({ areaM2: st.areaM2, gsm: cur.gsm, vertexCount: st.vertexCount });
      const b = toBlenderCloth(cur, st);
      info.replaceChildren(
        `Browser-Mesh: ${st.areaM2.toFixed(3)} m² · ${st.vertexCount.toLocaleString('de-DE')} Vertices → ${(m.totalKg * 1000).toFixed(0)} g gesamt, ${(m.vertexMassKg * 1e6).toFixed(2)} mg je Vertex.`,
        el('br'), `Blender-Vorschau: Zug ${b.tension_stiffness} · Biegung ${b.bending_stiffness} · Dämpfung ${b.tension_damping} · Kollisionsabstand ${(b.collision.distance_min * 1000).toFixed(1)} mm · Reibung ${b.collision.friction}.`,
        el('br'), 'Die Masse im Blender-Auftrag wird aus der echten Meshfläche des Masters neu berechnet.');
    } else {
      info.replaceChildren(worn ? 'Kennzahlen erscheinen nach dem Aufbau der Figur.' : 'Dieses Stück trägt die Figur gerade nicht – die Werte werden trotzdem gespeichert.');
    }
  };
  updateInfo();

  const chips = el('div', { class: 'chips' }, GARMENTS.map((x) => el('button', {
    class: `chip ${x.id === gid ? 'on' : ''}`, onclick: () => { state.fabricGarment = x.id; renderTab(); },
  }, x.label)));
  const effects = {
    gsm: 'wirkt im Blender-Auftrag (Masse)', thicknessMm: 'Browser: Körperabstand · Blender: Solidify/Kollision',
    stretchPct: 'Blender: Zug-/Drucksteifigkeit', bending: 'Blender: Faltenwiderstand', damping: 'Blender: Nachschwingen',
    friction: 'Blender: Kollisionsreibung', roughness: 'Browser: Materialdarstellung',
  };
  parts.push(
    el('h3', {}, 'Kleidung: Stoff und Eigenschaften'), chips,
    el('p', { class: 'note' }, `${g.label} · Slot ${g.slot === 'top' ? 'Oberteil' : 'Unterteil'} · Standardstoff ${FABRIC_PRESETS.find((x) => x.id === g.defaultFabric).label}. Simulationsansatz: ${g.simulation}.`),
    selectRow('Stoffvorlage', f.preset, FABRIC_PRESETS.map((x) => [x.id, x.label]), (v) => {
      setFabricState(p, gid, resolveFabric(v, {}));
      persist(); scheduleRebuild(); renderTab();
    }),
    ...FABRIC_KEYS.map((k) => {
      const L = FABRIC_LIMITS[k];
      const row = slider(L.label, f[k], [L.min, L.max, L.step], (v) => set(k, v, { visual: k === 'roughness', geometry: k === 'thicknessMm' }), (v) => `${Number(v).toLocaleString('de-DE')}${L.unit ? ` ${L.unit}` : ''}`);
      row.title = effects[k];
      return row;
    }),
    info,
    el('div', { class: 'btns' },
      el('button', { class: 'btn', onclick: () => { setFabricState(p, gid, resolveFabric(fabricState(p, gid).preset, {})); persist(); scheduleRebuild(); renderTab(); } }, 'Auf Vorlage zurücksetzen'),
      el('button', {
        class: 'btn primary', disabled: !!p.customFigure, title: p.customFigure ? 'Für importierte Figuren deaktiviert' : '',
        onclick: () => {
          try {
            const st = state.figure?.stats.garments?.[gid];
            const job = buildClothJob(p, gid, st && worn ? st : null);
            download(clothJobFilename(p, gid), job);
            toast('Blender-Stoffauftrag gespeichert.');
          } catch (e) { toast(e.message, true); }
        },
      }, 'Blender-Stoffauftrag speichern')),
    p.customFigure ? el('p', { class: 'warn' }, 'Für importierte Figuren ist der Stoffauftrag deaktiviert, weil ihre Kleidung nicht an die vier Basis-Meshes gebunden ist.') : null,
    el('p', { class: 'note' }, 'Alle Stoffwerte sind bearbeitbare Startwerte, keine gemessenen Datenblätter. Stoffvorlagen sind keine zusätzlichen Schnitte.'),
  );
  return parts;
}

// --- Eigene Figur (GLB-Import) ---
function tabImport(p) {
  const file = el('input', { type: 'file', accept: '.glb,model/gltf-binary', hidden: true });
  file.addEventListener('change', () => file.files[0] && importGlb(p, file.files[0]));
  const reportBox = el('div', { id: 'importReport' });
  if (state.lastReport) reportBox.append(renderReport(state.lastReport));
  const storedBox = el('div', { class: 'list' }, el('p', { class: 'note' }, 'Lade lokalen Speicher …'));
  store.listFigures().then((items) => {
    storedBox.replaceChildren(...(items.length ? items.map((it) => el('div', { class: 'fig' },
      el('span', { style: 'flex:1' }, el('strong', {}, it.name), el('br'), el('span', { class: 'note' }, `${fmtMiB(it.sizeBytes)} · ${it.sha256.slice(0, 12)}…`)),
      el('button', { class: 'btn', onclick: () => { p.customFigure = { sha256: it.sha256, name: it.name, sizeBytes: it.sizeBytes, report: summarize(it.report), materialOverrides: {} }; state.custom = null; changed({ tabs: true }); } }, 'Verwenden'),
      el('button', { class: 'btn danger', onclick: async () => { if (confirm(`„${it.name}“ aus dem lokalen Browserspeicher löschen?`)) { await store.deleteFigure(it.sha256); renderTab(); } } }, 'Löschen'),
    )) : [el('p', { class: 'note' }, 'Noch keine GLB-Datei lokal gespeichert.')]));
  }).catch((e) => storedBox.replaceChildren(el('p', { class: 'err' }, e.message)));

  const parts = [
    el('h3', {}, 'Eigene Figur importieren'),
    el('p', { class: 'note' }, `GLB 2.0 mit eingebetteten Daten, maximal ${MAX_GLB_BYTES / 1048576} MiB, ohne Draco/Meshopt/KTX2. Die Datei bleibt lokal im Browser (IndexedDB, SHA-256) und wird nicht hochgeladen.`),
    el('div', { class: 'btns' },
      el('button', { class: 'btn primary', onclick: () => file.click() }, 'GLB importieren'),
      el('button', { class: 'btn', disabled: !p.customFigure, onclick: () => { p.customFigure = null; changed({ tabs: true }); toast('Basisfigur wiederhergestellt. Die importierte Datei bleibt gespeichert.'); } }, 'Basisfigur wählen')),
    file, reportBox,
  ];
  if (p.customFigure) {
    parts.push(el('h3', {}, `Aktiv: ${p.customFigure.name}`));
    if (!state.gl) parts.push(el('p', { class: 'note' }, 'Ohne WebGL steht nur der Prüfbericht zur Verfügung.'));
    if (state.custom) {
      parts.push(el('h3', {}, 'Materialien bearbeiten'));
      const ov = (p.customFigure.materialOverrides ||= {});
      for (const m of state.custom.materials) {
        if (!m.name && state.custom.materials.length > 12) continue;
        const name = m.name || `Material ${m.id}`;
        const o = (ov[name] ||= {});
        if (m.color) parts.push(colorRow(name, `#${m.color.getHexString()}`, (v) => { o.color = v; m.color.set(v); persist(); }));
        if ('roughness' in m) parts.push(slider(`Rauheit ${name}`.slice(0, 22), Number(m.roughness.toFixed(2)), [0, 1, 0.01], (v) => { o.roughness = v; m.roughness = v; persist(); }));
      }
      const counts = state.custom.realism.reduce((a, e) => ((a[e.cls] = (a[e.cls] || 0) + 1), a), {});
      const toggle = (key, label) => {
        const cb = el('input', { type: 'checkbox', checked: !!p.customFigure[key] });
        cb.addEventListener('change', () => { p.customFigure[key] = cb.checked; applyCustomAppearance(p); persist(); });
        return el('label', { class: 'row two' }, el('span', {}, label), cb);
      };
      parts.splice(parts.length - 0, 0,
        el('h3', {}, 'Realistische Figur bearbeiten'),
        el('p', { class: 'note' }, `Erkannte Materialien: Haut ${counts.skin || 0} · Haare ${counts.hair || 0} · Augen ${counts.eye || 0} · Zähne ${counts.teeth || 0} · Sonstige ${counts.other || 0}. Hautton und Haarfarbe aus „Erscheinung“ werden detailerhaltend auf die Originaltexturen umgerechnet: Poren, Sommersprossen und Strähnen bleiben erhalten.`),
        toggle('toneSkin', 'Hautton anwenden'),
        toggle('toneHair', 'Haarfarbe anwenden'),
        el('div', { class: 'btns' }, el('button', { class: 'btn', onclick: () => { state.tab = 'erscheinung'; renderTabs(); renderTab(); } }, 'Zu Erscheinung (Hautton, Haare)')),
        el('p', { class: 'note' }, 'Weitere Herkunft/Ethnie aus diesem Master: Figur duplizieren, Herkunftsvorlage bzw. Hautton wählen, „Hautton anwenden“ aktivieren. Gesichtsform ändert sich dabei nicht – dafür braucht der Master Morph Targets oder eine eigene Scan-Variante.'));
    }
  }
  parts.push(el('h3', {}, 'Lokal gespeicherte Figuren'), storedBox, formatTable());
  return parts;
}

async function importGlb(p, f) {
  if (f.size > MAX_GLB_BYTES) { toast(`Datei ist ${fmtMiB(f.size)} groß; Grenze 150 MiB.`, true); return; }
  const buf = await f.arrayBuffer();
  let report;
  try { report = validateGlb(buf).report; }
  catch (e) {
    state.lastReport = { error: e instanceof GlbError ? e.message : `Prüfung fehlgeschlagen: ${e.message}`, name: f.name };
    renderTab(); toast(state.lastReport.error, true); return;
  }
  let loadedInfo = {};
  if (state.gl) {
    try { loadedInfo = (await state.R.loadGlb(buf.slice(0), 1.7)).report; }
    catch (e) { state.lastReport = { error: `GLTFLoader konnte die Datei nicht laden: ${e.message}`, name: f.name }; renderTab(); toast(state.lastReport.error, true); return; }
  }
  const sha256 = await sha256Hex(buf);
  try { await store.putFigure({ sha256, name: f.name, bytes: new Uint8Array(buf), report }); }
  catch (e) { toast(`Lokales Speichern fehlgeschlagen: ${e.message}`, true); return; }
  p.customFigure = { sha256, name: f.name, sizeBytes: f.size, report: summarize(report), materialOverrides: {} };
  if (report.clips.length) p.motion.id = `import:${report.clips[0]}`;
  state.lastReport = { ...report, boneNames: loadedInfo.boneNames, morphNames: loadedInfo.morphNames, name: f.name, sha256 };
  state.custom = null;
  changed({ tabs: true });
  toast(`${f.name} importiert: ${report.meshes} Meshes, ${report.joints} Gelenke, ${report.clips.length} Clips.`);
}

const summarize = (r) => r && ({ meshes: r.meshes, joints: r.joints, images: r.images?.length ?? 0, clips: r.clips, triangles: r.triangles, sizeBytes: r.sizeBytes });

function renderReport(r) {
  if (r.error) return el('div', {}, el('h3', {}, 'Importbericht'), el('p', { class: 'err' }, `${r.name}: ${r.error}`));
  const rows = [
    ['Datei', r.name], ['Größe', fmtMiB(r.sizeBytes)], ['SHA-256', r.sha256 ? `${r.sha256.slice(0, 16)}…` : '–'], ['Generator', r.generator || '–'],
    ['Meshes', r.meshes], ['Gelenke', r.joints], ['Skins', r.skins], ['Dreiecke', r.triangles.toLocaleString('de-DE')],
    ['Bilder', r.images.map((i) => (i.width ? `${i.width}×${i.height}` : i.mimeType || '?')).join(', ') || '–'],
    ['Materialien', r.materials.length], ['Animationsclips', r.clips.join(', ') || '–'], ['Morph Targets', r.morphTargets],
    ...(r.boneNames?.length ? [['Knochen (Auszug)', `${r.boneNames.slice(0, 12).join(', ')}${r.boneNames.length > 12 ? ' …' : ''}`]] : []),
    ...(r.morphNames?.length ? [['Morph-Namen (Auszug)', r.morphNames.slice(0, 12).join(', ')]] : []),
  ];
  return el('div', {}, el('h3', {}, 'Importbericht'),
    el('table', { class: 'rep' }, rows.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, String(v))))),
    ...r.warnings.map((w) => el('p', { class: 'warn' }, w)),
    el('p', { class: 'note' }, 'Studio-Moves werden fremden Skeletten nicht aufgezwungen; die Kleidung der Basisfigur wird nicht automatisch übertragen.'));
}

function formatTable() {
  const rows = [
    ['.glb (glTF 2.0)', 'Direktimport. Geometrie, Texturen, Rig und Clips einbetten.'],
    ['.gltf + .bin + Bilder', 'Kein Mehrdateienimport. Zuerst als eingebettete GLB exportieren.'],
    ['.fbx', 'In Blender prüfen und als GLB exportieren.'],
    ['.blend', 'In Blender als GLB exportieren; kein Browserimport.'],
    ['.obj', 'Statische Geometrie; nach Konvertierung anschaubar, für Bewegung Rig nötig.'],
    ['.vrm', 'Kein VRM-Importer; Humanoid-Zuordnung, Spring Bones, VRM-Materialien nicht automatisch.'],
  ];
  return el('div', {}, el('h3', {}, 'Welches Format?'), el('table', { class: 'rep' }, rows.map(([k, v]) => el('tr', {}, el('td', {}, k), el('td', {}, v)))),
    el('p', { class: 'note' }, 'Ein Foto (PNG/JPG) ist keine importierbare 3D-Figur. Für Fotorealismus eine gescannte oder in einem Character-Tool erzeugte Figur als GLB mit PBR-Texturen importieren.'));
}

// --- Bewegung ---
function tabBewegung(p) {
  const m = p.motion;
  if (p.customFigure) {
    const clips = state.custom?.clips || [];
    return [
      el('h3', {}, 'Bewegung (importierte Figur)'),
      el('p', { class: 'note' }, 'Prozedurale Studio-Moves, Sitzwinkel und Eigenaktivität sind für fremde Skelette deaktiviert. Kein automatisches Retargeting.'),
      selectRow('Clip', m.id?.startsWith('import:') ? m.id : 'none', [['none', 'Keine Bewegung'], ...clips.map((c) => [`import:${c.name}`, `Import: ${c.name}`])], (v) => { m.id = v; playCustomClip(v); persist(); }),
      clips.length ? null : el('p', { class: 'note' }, 'Die Datei enthält keine Animationsclips.'),
    ];
  }
  const { MOVES = [], MOVE_GROUPS = [] } = state.R || {};
  const man = (m.manual ||= {});
  const sel = el('select', { 'aria-label': 'Bewegung' }, MOVE_GROUPS.map((g) => el('optgroup', { label: g.label },
    MOVES.filter((x) => x.group === g.id).map((x) => el('option', { value: x.id, selected: x.id === m.id }, x.label)))));
  sel.addEventListener('change', () => { m.id = sel.value; persist(); });
  const chips = (group) => el('div', { class: 'chips' }, MOVES.filter((x) => x.group === group).map((x) => el('button', {
    class: `chip ${x.id === m.id ? 'on' : ''}`, onclick: () => { m.id = x.id; persist(); renderTab(); },
  }, x.label)));
  return [
    el('h3', {}, 'Bewegung'),
    el('div', { class: 'row two' }, el('label', {}, 'Auswahl'), sel),
    el('h3', {}, 'Posen'), chips('pose'),
    el('h3', {}, 'Gesten'), chips('geste'),
    el('h3', {}, 'Tänze'), chips('tanz'),
    m.id === 'sequence' ? el('p', { class: 'note' }, `Tanzfolge: ${(m.sequence || []).map((q) => `${MOVES.find((x) => x.id === q.id)?.label || q.id} (${q.beats} Schläge)`).join(' → ') || 'keine im Projekt – Groove als Ersatz'}`) : null,
    ...kitSection(p),
    el('div', { class: 'btns' }, el('button', {
      class: 'btn', onclick: () => {
        let n = 0;
        for (const q of state.profiles) if (q !== p && !q.customFigure) { q.motion = { ...q.motion, id: m.id, intensity: m.intensity, bpm: m.bpm, mirror: m.mirror, speed: m.speed, sequence: JSON.parse(JSON.stringify(m.sequence || [])) }; n++; }
        persist(); toast(`Bewegung „${moveLabel(m.id)}“ auf ${n} weitere Figur(en) übertragen.`);
      },
    }, 'Für alle Figuren übernehmen')),
    slider('Intensität', m.intensity ?? 1, [0, 1.5, 0.05], (v) => { m.intensity = v; persist(); }),
    slider('Tempo BPM', m.bpm ?? 104, [60, 160, 1], (v) => { m.bpm = v; persist(); }),
    el('h3', {}, 'Grundhaltung'),
    slider('Arm links seitl.', man.armLZ ?? 6, [-5, 80, 1], (v) => { man.armLZ = v; persist(); }, (v) => `${v}°`),
    slider('Arm rechts seitl.', man.armRZ ?? 6, [-5, 80, 1], (v) => { man.armRZ = v; persist(); }, (v) => `${v}°`),
    slider('Ellbogen links', man.elbowL ?? 5, [0, 140, 1], (v) => { man.elbowL = v; persist(); }, (v) => `${v}°`),
    slider('Ellbogen rechts', man.elbowR ?? 5, [0, 140, 1], (v) => { man.elbowR = v; persist(); }, (v) => `${v}°`),
    slider('Kopf nicken', man.headX ?? 0, [-30, 30, 1], (v) => { man.headX = v; persist(); }, (v) => `${v}°`),
    slider('Kopf drehen', man.headY ?? 0, [-60, 60, 1], (v) => { man.headY = v; persist(); }, (v) => `${v}°`),
    slider('Oberkörper neigen', man.lean ?? 0, [-20, 30, 1], (v) => { man.lean = v; persist(); }, (v) => `${v}°`),
    el('p', { class: 'note' }, 'Für die Passformprüfung: „Arme heben“, „Knie beugen“ und „Sitzen“ zeigen Achsel, Knie und Bund unter Bewegung.'),
  ];
}

function moveLabel(id) {
  if (id?.startsWith('kit:')) {
    const k = id.slice(4);
    return [...(state.kitPack?.poses || []), ...(state.kitPack?.animations || [])].find((x) => x.id === k)?.label || k;
  }
  return (state.R?.MOVES || []).find((x) => x.id === id)?.label || id;
}

/** UI-Abschnitt für das FALK Studio MotionKit. */
function kitSection(p) {
  const m = p.motion;
  const pack = state.kitPack;
  if (!pack) return [el('h3', {}, 'FALK MotionKit'), el('p', { class: 'note' }, 'MotionKit nicht geladen (public/motions/falk_motion_pack.json fehlt).')];
  const items = [...pack.poses.map((x) => ({ ...x, type: 'Pose' })), ...pack.animations.map((x) => ({ ...x, type: 'Animation' }))];
  const out = [el('h3', {}, `FALK MotionKit · ${items.length} Einträge`)];
  for (const g of pack.groups) {
    const list = items.filter((x) => x.group === g.id);
    if (!list.length) continue;
    out.push(el('p', { class: 'note' }, g.label));
    out.push(el('div', { class: 'chips' }, list.map((x) => el('button', {
      class: `chip ${m.id === `kit:${x.id}` ? 'on' : ''}`,
      title: `${x.type}${x.requires?.length ? ` · benötigt: ${x.requires.join(', ')} (noch nicht enthalten)` : ''}`,
      onclick: () => { m.id = `kit:${x.id}`; persist(); renderTab(); },
    }, x.label, x.type === 'Animation' ? ' ▸' : '', x.requires?.length ? ' *' : ''))));
  }
  const mirror = el('input', { type: 'checkbox', checked: !!m.mirror });
  mirror.addEventListener('change', () => { m.mirror = mirror.checked; persist(); });
  out.push(
    el('label', { class: 'row two' }, el('span', {}, 'Spiegeln (links ↔ rechts)'), mirror),
    slider('Abspielgeschwindigkeit', m.speed ?? 1, [0.25, 2, 0.05], (v) => { m.speed = v; persist(); }, (v) => `${v}×`),
    el('p', { class: 'note' }, '▸ = Animation · * = benötigt Requisite/IK/Bodenkontakt, die noch nicht eingebaut sind. Statische Posen wechseln ohne Überblendung.'),
  );
  return out;
}

// --- Projekt ---
function tabProjekt(p) {
  const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    try {
      const report = applyProject(JSON.parse(await f.text()));
      state.custom = null;
      changed({ tabs: true });
      toast(`${report.characters} Figur(en) geladen.${report.mapped.length ? ` ${report.mapped.length} Kleidungszuordnung(en).` : ''}`);
      state.lastProjectReport = report;
    } catch (e) { toast(`Projekt nicht lesbar: ${e.message}`, true); }
  });
  const rep = state.lastProjectReport;
  const refs = (p.references || []).filter((r) => typeof r.data === 'string' && r.data.startsWith('data:image/'));
  return [
    el('h3', {}, 'Projektdatei'),
    el('p', { class: 'note' }, 'Format „character-studio“ (Schema 1) mit atelierV2 und atelierV5. Unbekannte Felder älterer Versionen werden beim Export erhalten. Importierte GLB-Dateien sind nur als SHA-256-Referenz enthalten – Originaldatei und Projekt-JSON gemeinsam sichern.'),
    el('div', { class: 'btns' },
      el('button', { class: 'btn primary', onclick: () => download('Charakteratelier_Projekt_V5.json', saveProject(state.profiles, state.raw)) }, 'Projekt exportieren'),
      el('button', { class: 'btn', onclick: () => file.click() }, 'Projekt importieren'),
      el('button', { class: 'btn danger', onclick: async () => { if (confirm('Startprojekt Lissy & Clara neu laden? Ungesicherte Änderungen gehen verloren.')) { await loadStarter(); changed({ tabs: true }); } } }, 'Startprojekt laden')),
    file,
    rep ? el('div', {}, ...rep.mapped.map((m) => el('p', { class: 'note' }, m)), ...rep.warnings.map((w) => el('p', { class: 'warn' }, w))) : null,
    el('h3', {}, `Referenzen · ${p.name}`),
    refs.length ? el('div', { class: 'refs' }, refs.map((r) => el('figure', {}, el('img', { src: r.data, alt: r.label, loading: 'lazy' }), el('figcaption', {}, r.label)))) : el('p', { class: 'note' }, 'Keine Referenzbilder hinterlegt.'),
    el('p', { class: 'note' }, 'Referenzbilder dienen als Vorlage für Outfits und Erscheinungsbild; sie werden nicht automatisch in 3D umgewandelt.'),
  ];
}

// ---------- Start -----------------------------------------------------------------------
async function loadStarter() {
  const res = await fetch(STARTER_URL);
  if (!res.ok) throw new Error(`Startprojekt nicht gefunden (${res.status}).`);
  state.lastProjectReport = applyProject(await res.json());
  state.custom = null;
}

async function boot() {
  const setMode = (m) => {
    document.body.classList.toggle('view', m === 'view');
    $('#modeView').classList.toggle('on', m === 'view'); $('#modeEdit').classList.toggle('on', m === 'edit');
    setTimeout(() => state.stage?.resize(), 0);
  };
  $('#modeView').onclick = () => setMode('view');
  $('#modeEdit').onclick = () => setMode('edit');

  const { webglAvailable } = await import('./render/stage.js');
  state.gl = webglAvailable();
  if (state.gl) {
    const [{ Stage }, { Figure }, motion, importer] = await Promise.all([
      import('./render/stage.js'), import('./render/figure.js'), import('./render/motion.js'), import('./render/importer.js'),
    ]);
    const realism = await import('./render/realism.js');
    const { StudioPosePlayer } = await import('./render/studio_pose_player.js');
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}motions/falk_motion_pack.json`);
      if (r.ok) state.kitPack = await r.json();
    } catch { /* MotionKit optional */ }
    state.R = { Stage, Figure, applyPose: motion.applyPose, MOVES: motion.MOVES, MOVE_GROUPS: motion.MOVE_GROUPS, loadGlb: importer.loadGlb, prepareRealistic: realism.prepareRealistic, StudioPosePlayer, applyAppearance: realism.applyAppearance };
    state.stage = new Stage($('#viewport'));
    state.stage.onFrame = (t, dt) => {
      const p = active();
      if (state.figure && p && !p.customFigure) animateBase(p, t);
      state.custom?.mixer?.update(dt);
    };
  } else {
    $('#nogl').hidden = false;
    state.R = { MOVES: [] };
  }
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => state.stage?.focus(b.dataset.view, (active()?.shape.heightCm ?? 170) / 100)));
  $('#spin').onclick = (e) => { if (!state.stage) return; state.stage.spin = !state.stage.spin; e.currentTarget.setAttribute('aria-pressed', String(state.stage.spin)); };
  $('#shot').onclick = () => { if (state.stage) download(`${active()?.name || 'Figur'}_Atelier.png`, dataUrlToBlob(state.stage.screenshot())); };

  let loaded = false;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { state.lastProjectReport = applyProject(JSON.parse(saved)); loaded = true; }
  } catch { /* lokaler Speicher nicht verfügbar */ }
  if (!loaded) {
    try { await loadStarter(); }
    catch (e) { toast(e.message, true); state.profiles = [newProfile({ name: 'Neue Figur' })]; state.activeId = state.profiles[0].id; }
  }
  renderTabs(); renderTab();
  await showActive();
  if (state.stage) state.stage.frameFigure((active()?.shape.heightCm ?? 170) / 100);
  window.__atelier = state; // für automatisierte Prüfungen
  document.body.dataset.ready = '1';
}

function dataUrlToBlob(url) {
  const [head, b64] = url.split(',');
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: head.match(/:(.*?);/)[1] });
}

boot();
