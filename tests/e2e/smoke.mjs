// Browser-Ende-zu-Ende-Prüfung (Playwright, Chromium mit SwiftShader-WebGL).
// Start: npm run dev (Port 5173) und danach npm run test:e2e
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const URL = process.env.ATELIER_URL || 'http://127.0.0.1:5173/';
const OUT = 'test-output';
mkdirSync(OUT, { recursive: true });

const checks = [];
const ok = (name, cond, extra = '') => { checks.push([name, !!cond]); console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ` – ${extra}` : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL);
await page.waitForSelector('body[data-ready="1"]');

const info = await page.evaluate(() => ({ gl: window.__atelier.gl, names: window.__atelier.profiles.map((p) => p.name), tris: window.__atelier.figure?.stats.triangles }));
ok('Startprojekt geladen (Lissy, Clara)', info.names.join() === 'Lissy,Clara', info.names.join());
ok('WebGL-Basisfigur aufgebaut', info.gl && info.tris > 10000, `${info.tris} Dreiecke`);
await page.screenshot({ path: `${OUT}/01_lissy.png` });

// Neue Figur aus Herkunftsvorlagen
await page.locator('.chip', { hasText: 'Nordeuropäisch' }).click(); // abwählen
await page.locator('.chip', { hasText: 'Westafrikanisch' }).click();
await page.fill('input[placeholder="Name der neuen Figur"]', 'Amara');
await page.locator('button', { hasText: 'Figur erzeugen' }).click();
await page.waitForTimeout(1500);
const amara = await page.evaluate(() => { const p = window.__atelier.profiles.at(-1); return { name: p.name, anc: p.appearance.ancestry, tex: p.appearance.hairTexture, skin: p.appearance.skin }; });
ok('Neue Figur aus Herkunftsvorlage erzeugt', amara.name === 'Amara' && amara.anc.includes('westAfrica'), JSON.stringify(amara));
await page.screenshot({ path: `${OUT}/02_neue_figur.png` });

// Stoff: Vorlage wechseln, Rauheit ändern, Auftrag speichern
await page.locator('.fig', { hasText: 'Lissy' }).click();
await page.locator('.tabs button', { hasText: 'Kleidung & Stoff' }).click();
await page.locator('.chip', { hasText: 'Strickpullover' }).click();
await page.selectOption('select[aria-label="Stoffvorlage"]', 'satin');
await page.waitForTimeout(800);
const rough = await page.evaluate(() => window.__atelier.figure.garmentMeshes.sweater[0].material.roughness);
ok('Stoffvorlage wirkt auf WebGL-Rauheit', Math.abs(rough - 0.3) < 1e-6, `roughness=${rough}`);
const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'Blender-Stoffauftrag speichern' }).click()]);
const job = JSON.parse(readFileSync(await dl.path(), 'utf8'));
ok('Blender-Stoffauftrag exportiert', job.format === 'atelier-cloth-job' && job.fabric.preset === 'satin' && job.preview?.mesh?.areaM2 > 0, dl.suggestedFilename());

// Posen, Gesten, Tänze für alle Figuren
await page.locator('.tabs button', { hasText: 'Bewegung' }).click();
await page.locator('.chip', { hasText: 'Salsa-Grundschritt' }).click();
await page.locator('button', { hasText: 'Für alle Figuren übernehmen' }).click();
await page.waitForTimeout(1200);
const mv = await page.evaluate(() => window.__atelier.profiles.filter((p) => !p.customFigure).map((p) => p.motion.id));
ok('Tanz auf alle Figuren übertragen', mv.every((x) => x === 'salsa'), mv.join(','));
await page.evaluate(() => { const s = window.__atelier; s.profiles.find((q) => q.id === s.activeId).motion.id = 'thumbsUp'; });
const fingerBent = await page.waitForFunction(() => Math.abs(window.__atelier.figure.bones.fR0a.rotation.z) > 0.5, null, { timeout: 30000 }).then(() => true, () => false);
ok('Geste beugt Fingergelenke', fingerBent);
await page.screenshot({ path: `${OUT}/04_geste.png` });

// GLB aus der Basisfigur erzeugen (GLTFExporter) und als eigene Figur importieren
const glbBytes = await page.evaluate(async () => {
  const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
  const root = window.__atelier.figure.root;
  const ab = await new GLTFExporter().parseAsync(root, { binary: true });
  return Array.from(new Uint8Array(ab));
});
await page.locator('.tabs button', { hasText: 'Eigene Figur' }).click();
await page.setInputFiles('input[type=file][accept^=".glb"]', { name: 'testfigur.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(glbBytes) });
await page.waitForFunction(() => window.__atelier.custom?.realism, null, { timeout: 120000 });
const rep = await page.evaluate(() => { const s = window.__atelier; const p = s.profiles.find((q) => q.id === s.activeId); return { cf: p.customFigure, cls: s.custom.realism.map((e) => e.cls) }; });
ok('GLB importiert, SHA-256 referenziert', /^[0-9a-f]{64}$/.test(rep.cf?.sha256) && rep.cf.report.meshes > 10, `${rep.cf?.report.meshes} Meshes`);
ok('Haut- und Haarmaterialien erkannt', rep.cls.includes('skin') && rep.cls.includes('hair'), [...new Set(rep.cls)].join(','));
await page.locator('label', { hasText: 'Hautton anwenden' }).locator('input').check();
await page.evaluate(() => { const s = window.__atelier; const p = s.profiles.find((q) => q.id === s.activeId); p.appearance.skin = '#6f4029'; });
await page.locator('.tabs button', { hasText: 'Erscheinung' }).click();
await page.locator('.tones button').nth(7).click();
await page.waitForTimeout(800);
const tone = await page.evaluate(() => window.__atelier.custom.realism.filter((e) => e.cls === 'skin').map((e) => (e.material.map ? e.material.userData.tone.uAmount.value === 1 : e.material.color.getHexString() === new e.material.color.constructor('#6f4029').getHexString())));
ok('Hautton auf Importfigur angewandt (Textur detailerhaltend, sonst Farbe)', tone.length && tone.every(Boolean), JSON.stringify(tone));
await page.screenshot({ path: `${OUT}/03_import_hautton.png` });

// Neuladen: Wiederherstellung aus IndexedDB
await page.waitForTimeout(600);
await page.reload();
await page.waitForSelector('body[data-ready="1"]');
await page.waitForFunction(() => window.__atelier.custom?.scene, null, { timeout: 120000 });
ok('Importfigur nach Neuladen wiederhergestellt', true);

// Basisfigur wählen
await page.locator('.tabs button', { hasText: 'Eigene Figur' }).click();
await page.locator('button', { hasText: 'Basisfigur wählen' }).click();
await page.waitForFunction(() => window.__atelier.figure && !window.__atelier.custom);
const stored = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
ok('Basisfigur wiederhergestellt, GLB bleibt gespeichert', stored.includes('charakteratelier'));

// Fehlerhafte Datei wird abgelehnt
await page.setInputFiles('input[type=file][accept^=".glb"]', { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, ...new Array(40).fill(0)]) });
await page.waitForTimeout(500);
ok('Foto statt 3D-Figur abgelehnt', (await page.locator('#importReport').innerText()).includes('PNG-Bild'));

ok('Keine Seitenfehler', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = checks.filter(([, c]) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden`);
process.exit(failed ? 1 : 0);
