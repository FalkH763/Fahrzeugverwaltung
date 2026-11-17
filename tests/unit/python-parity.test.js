import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FABRIC_PRESETS, resolveFabric, toBlenderCloth } from '../../src/core/fabrics.js';

const py = spawnSync('python3', ['--version']);
const prod = fileURLToPath(new URL('../../produktion/', import.meta.url));

test('Blender-Skript rechnet Stoffwerte identisch zum Browser um', { skip: py.status !== 0 && 'python3 fehlt' }, () => {
  const mesh = { areaM2: 1.0832, vertexCount: 12963 };
  const fabrics = FABRIC_PRESETS.map((p) => resolveFabric(p.id));
  const code = `import sys, json; sys.path.insert(0, ${JSON.stringify(prod)}); import configure_cloth as c
f = json.load(sys.stdin); print(json.dumps([c.blender_params(x, ${mesh.areaM2}, ${mesh.vertexCount}) for x in f]))`;
  const r = spawnSync('python3', ['-I', '-c', code], { input: JSON.stringify(fabrics), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const pyOut = JSON.parse(r.stdout);
  fabrics.forEach((f, i) => {
    const js = toBlenderCloth(f, mesh), p = pyOut[i];
    const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${f.preset}: ${a} ≠ ${b}`);
    near(js.mass, p.mass, 1e-7); near(js.tension_stiffness, p.tension_stiffness, 1e-3);
    near(js.bending_stiffness, p.bending_stiffness, 1e-3); near(js.tension_damping, p.tension_damping, 1e-3);
    near(js.collision.distance_min, p.distance_min, 1e-5); near(js.collision.friction, p.friction, 1e-3);
    near(js.solidify_thickness, p.thickness, 1e-6);
  });
});

test('Beispielauftrag ist vom Skript lesbar', { skip: py.status !== 0 && 'python3 fehlt' }, () => {
  const code = `import sys; sys.path.insert(0, ${JSON.stringify(prod)}); import configure_cloth as c
j = c.load_job(${JSON.stringify(prod + 'Stoffsimulation_TShirt_Beispiel.json')}); print(j["garment"]["object"])`;
  const r = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'Garment_TShirt');
});
