import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FABRIC_PRESETS, validateFabric, resolveFabric, clothMass, toBlenderCloth, diffFromPreset, getPreset } from '../../src/core/fabrics.js';
import { GARMENTS, mapLegacyItem } from '../../src/core/garments.js';
import { loadProject, saveProject, fabricState, setFabricState, newProfile } from '../../src/core/project.js';
import { validateGlb, GlbError, sha256Hex, imageSize } from '../../src/core/glbValidate.js';
import { buildClothJob } from '../../src/core/clothJob.js';
import { generateAppearance, ANCESTRY_PRESETS, SKIN_TONES, FACE_KEYS } from '../../src/core/appearance.js';
import { anatomy } from '../../src/core/anatomy.js';
import { DEFAULT_SHAPE } from '../../src/core/project.js';

const starter = JSON.parse(readFileSync(new URL('../../public/beispiele/Lissy_und_Clara_Startprojekt.json', import.meta.url), 'utf8'));

// ---------- Stoffe ----------
test('zwölf Stoffvorlagen mit den Werten der Spezifikation sind gültig', () => {
  assert.equal(FABRIC_PRESETS.length, 12);
  const expect = { cotton: [180, 0.6, 8, 0.85], denim: [380, 1.1, 5, 0.9], woolKnit: [330, 2.5, 25, 0.95], leather: [650, 1.2, 3, 0.52], polyElastane: [200, 0.6, 60, 0.42], satin: [110, 0.3, 5, 0.3] };
  for (const [id, [gsm, th, st, ro]] of Object.entries(expect)) {
    const p = getPreset(id);
    assert.deepEqual([p.gsm, p.thicknessMm, p.stretchPct, p.roughness], [gsm, th, st, ro], id);
  }
  for (const p of FABRIC_PRESETS) assert.deepEqual(validateFabric(resolveFabric(p.id)), [], p.id);
});

test('Stoffprüfung meldet ungültige Werte, Überschreibungen werden begrenzt', () => {
  const bad = { ...resolveFabric('jersey'), gsm: -5, roughness: Number.NaN };
  const errs = validateFabric(bad);
  assert.equal(errs.length, 2);
  assert.equal(resolveFabric('jersey', { roughness: 7 }).roughness, 1);
  assert.deepEqual(diffFromPreset(resolveFabric('jersey', { gsm: 210 })), { gsm: 210 });
});

test('Masse bleibt bei feinerer Meshauflösung erhalten', () => {
  const a = clothMass({ areaM2: 1.2, gsm: 190, vertexCount: 2000 });
  const b = clothMass({ areaM2: 1.2, gsm: 190, vertexCount: 32000 });
  assert.ok(Math.abs(a.totalKg - 0.228) < 1e-12);
  assert.equal(a.totalKg, b.totalKg);
  assert.ok(Math.abs(a.vertexMassKg * 2000 - b.vertexMassKg * 32000) < 1e-12);
  assert.throws(() => clothMass({ areaM2: 0, gsm: 190, vertexCount: 10 }));
});

test('Blender-Abbildung: weniger Dehnung ⇒ steifer, Dicke ⇒ Kollisionsabstand ≥ 3 mm', () => {
  const mesh = { areaM2: 1, vertexCount: 1000 };
  const denim = toBlenderCloth(resolveFabric('denim'), mesh);
  const elastic = toBlenderCloth(resolveFabric('polyElastane'), mesh);
  assert.ok(denim.tension_stiffness > elastic.tension_stiffness);
  assert.ok(denim.bending_stiffness > elastic.bending_stiffness);
  assert.ok(toBlenderCloth(resolveFabric('satin'), mesh).collision.distance_min >= 0.003);
  assert.equal(toBlenderCloth(resolveFabric('woolKnit'), mesh).solidify_thickness, 0.0025);
});

// ---------- Projekt ----------
test('Startprojekt Lissy & Clara wird vollständig gelesen', () => {
  const { profiles, report } = loadProject(starter);
  assert.equal(profiles.length, 2);
  const [lissy, clara] = profiles;
  assert.equal(lissy.name, 'Lissy'); assert.equal(clara.name, 'Clara');
  assert.equal(clara.appearance.hairColor, '#a6522f');
  assert.equal(clara.appearance.hairTexture, 'curly');
  assert.equal(clara.wear.glasses.item, 'round');
  assert.equal(lissy.wear.top.item, 'sweater');
  assert.equal(clara.wear.top.item, 'sweater'); // hoodie → Strickpullover
  assert.equal(clara.wear.top.legacyItem, 'hoodie');
  assert.equal(lissy.shape.heightCm, 176);
  assert.equal(lissy.references.length, 6);
  assert.ok(report.mapped.length >= 2);
});

test('Export → Import ist verlustfrei und erhält Originalfelder', () => {
  const { profiles, raw } = loadProject(starter);
  setFabricState(profiles[0], 'tshirt', { ...fabricState(profiles[0], 'tshirt'), gsm: 222, roughness: 0.5 });
  const out = saveProject(profiles, raw);
  assert.equal(out.format, 'character-studio');
  assert.equal(out.atelierLooks['atelier-clara'], 'clara-hoodie');
  assert.equal(out.characters[1].outfit.top, 'hoodie'); // Original-ID bleibt für ältere Viewer
  assert.equal(out.characters[0].references[0].data, starter.characters[0].references[0].data);
  assert.deepEqual(out.atelierV2.figures['atelier-lissy'].wear.neck, starter.atelierV2.figures['atelier-lissy'].wear.neck);
  const again = loadProject(JSON.parse(JSON.stringify(out))).profiles;
  assert.equal(fabricState(again[0], 'tshirt').gsm, 222);
  assert.equal(fabricState(again[0], 'tshirt').roughness, 0.5);
  assert.deepEqual(again[1].appearance, profiles[1].appearance);
  assert.deepEqual(again[0].shape, profiles[0].shape);
});

test('unbekannte Kleidung wird ersetzt und gemeldet', () => {
  assert.deepEqual(mapLegacyItem('top', 'tshirt'), { id: 'tshirt', exact: true });
  assert.equal(mapLegacyItem('bottom', 'jeans').id, 'woolTrousers');
  assert.equal(mapLegacyItem('top', 'ballgown').unknown, true);
  assert.equal(GARMENTS.length, 4);
});

test('Projekt mit falschem Format wird abgelehnt', () => {
  assert.throws(() => loadProject({ format: 'other' }), /character-studio/);
});

// ---------- GLB ----------
function makeGlb(json, bin = new Uint8Array(0)) {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jl = Math.ceil(enc.length / 4) * 4, bl = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jl + (bin.length ? 8 + bl : 0);
  const buf = new Uint8Array(total); const dv = new DataView(buf.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jl, true); dv.setUint32(16, 0x4e4f534a, true);
  buf.set(enc, 20); for (let i = enc.length; i < jl; i++) buf[20 + i] = 0x20;
  if (bin.length) { dv.setUint32(20 + jl, bl, true); dv.setUint32(24 + jl, 0x004e4942, true); buf.set(bin, 28 + jl); }
  return buf;
}
const tri = {
  asset: { version: '2.0', generator: 'test' },
  buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }],
  animations: [{ name: 'Winken', channels: [], samplers: [] }],
};
const triBin = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);

test('gültige GLB: Bericht nennt Meshes, Dreiecke, Clips, fehlendes Rig', () => {
  const { report } = validateGlb(makeGlb(tri, triBin));
  assert.equal(report.meshes, 1); assert.equal(report.triangles, 1); assert.deepEqual(report.clips, ['Winken']);
  assert.equal(report.joints, 0);
  assert.ok(report.warnings.some((w) => /Kein Rig/.test(w)));
});

test('externe Dateiverweise, Draco/Meshopt/KTX2 und falsche Container werden sicher abgelehnt', () => {
  const ext = { ...tri, buffers: [{ byteLength: 36, uri: 'figur.bin' }] };
  assert.throws(() => validateGlb(makeGlb(ext)), (e) => e instanceof GlbError && e.code === 'external');
  const img = { ...tri, images: [{ uri: 'https://example.com/haut.png' }] };
  assert.throws(() => validateGlb(makeGlb(img, triBin)), (e) => e.code === 'external');
  for (const x of ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']) {
    assert.throws(() => validateGlb(makeGlb({ ...tri, extensionsUsed: [x] }, triBin)), (e) => e.code === 'compression', x);
  }
  const v1 = makeGlb(tri, triBin); new DataView(v1.buffer).setUint32(4, 1, true);
  assert.throws(() => validateGlb(v1), (e) => e.code === 'version');
  const cut = makeGlb(tri, triBin).slice(0, 40);
  assert.throws(() => validateGlb(cut), (e) => e.code === 'length');
  assert.throws(() => validateGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}')), (e) => e.code === 'gltf_json');
  assert.throws(() => validateGlb(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), (e) => e.code === 'image');
  // data:-URIs sind eingebettet und erlaubt
  const dataUri = { ...tri, buffers: [{ byteLength: 36, uri: 'data:application/octet-stream;base64,' + Buffer.from(triBin).toString('base64') }] };
  assert.equal(validateGlb(makeGlb(dataUri)).ok, true);
});

test('SHA-256 und PNG-Bildgröße', async () => {
  assert.equal(await sha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const png = new Uint8Array(32); png.set([0x89, 0x50, 0x4e, 0x47]); new DataView(png.buffer).setUint32(16, 2048); new DataView(png.buffer).setUint32(20, 1024);
  assert.deepEqual(imageSize(png), { width: 2048, height: 1024 });
});

// ---------- Stoffauftrag ----------
test('Blender-Stoffauftrag für Basisfigur; deaktiviert für importierte Figur', () => {
  const { profiles } = loadProject(starter);
  const job = buildClothJob(profiles[1], 'tshirt', { areaM2: 1.1, vertexCount: 5000 });
  assert.equal(job.format, 'atelier-cloth-job');
  assert.equal(job.character.master, 'masters/clara/clara_master.blend');
  assert.equal(job.garment.object, 'Garment_TShirt');
  assert.equal(job.fabric.preset, 'jersey');
  assert.ok(job.preview.blender.mass > 0);
  profiles[1].customFigure = { sha256: 'a'.repeat(64), name: 'x.glb' };
  assert.throws(() => buildClothJob(profiles[1], 'tshirt'), /deaktiviert/);
});

// ---------- Erscheinungsbild ----------
test('Herkunftsvorlagen erzeugen reproduzierbare, gültige und variierende Figuren', () => {
  assert.ok(ANCESTRY_PRESETS.length >= 10);
  for (const a of ANCESTRY_PRESETS) {
    const x = generateAppearance([a.id], 42);
    assert.deepEqual(x, generateAppearance([a.id], 42), a.id);
    assert.match(x.skin, /^#[0-9a-f]{6}$/);
    for (const k of Object.keys(FACE_KEYS)) assert.ok(x.face[k] >= 0 && x.face[k] <= 100, `${a.id} ${k}`);
    const idx = SKIN_TONES.findIndex((t) => t.hex === x.skin);
    assert.ok(idx >= a.skin[0] && idx <= a.skin[1], `${a.id} Hautton im Bereich`);
  }
  const variants = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(generateAppearance(['westAfrica', 'northEurope'], i + 1))));
  assert.equal(variants.size, 20);
});

// ---------- Anatomie / Passform ----------
test('Kleidung liegt bei extremen Körperformen außerhalb der Haut (Rumpf, alle Winkel)', () => {
  const shapes = [DEFAULT_SHAPE, { ...DEFAULT_SHAPE, heightCm: 150, weightKg: 45, bust: 70 }, { ...DEFAULT_SHAPE, heightCm: 200, weightKg: 125, bust: 140, stomach: 140, hips: 130 }];
  for (const shape of shapes) {
    const A = anatomy(shape);
    for (let f = 0; f <= 0.95; f += 0.05) {
      const y = A.torsoY(f);
      for (let th = 0; th < Math.PI * 2; th += 0.2) {
        const [bx, bz] = A.torsoPoint(y, th);
        const [gx, gz] = A.torsoPoint(y, th, { offset: 0.008, bridgeBust: true });
        assert.ok(Math.hypot(gx, gz) >= Math.hypot(bx, bz) - 1e-9, `f=${f.toFixed(2)} θ=${th.toFixed(1)}`);
      }
    }
    assert.ok(A.kneeY > A.ankleY && A.hipJ > A.kneeY && A.neckBase > A.shoulderJY);
    assert.ok(Math.abs(A.headCenterY + A.head.sy - shape.heightCm / 100) < 1e-9);
  }
});

test('neues Profil hat Standardstoffe aller vier Kleidungsstücke', () => {
  const p = newProfile();
  for (const g of GARMENTS) assert.equal(fabricState(p, g.id).preset, g.defaultFabric);
});
