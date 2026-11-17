import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StudioPosePlayer } from '../../src/render/studio_pose_player.js';

const pack = JSON.parse(readFileSync(new URL('../../public/motions/falk_motion_pack.json', import.meta.url), 'utf8'));
const RIG = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR', 'tL', 'tR',
  ...['L', 'R'].flatMap((s) => [0, 1, 2, 3].flatMap((i) => [`f${s}${i}a`, `f${s}${i}b`]))];

test('MotionKit-Auswahl: gültiges Schema, eindeutige IDs, keine ausgeschlossenen Einträge', () => {
  assert.equal(pack.schemaId, 'falk.studio.motionpack.v1');
  const all = [...pack.poses, ...pack.animations];
  assert.equal(new Set(all.map((x) => x.id)).size, all.length);
  assert.ok(!pack.groups.some((g) => g.id === 'boudoir'));
  for (const x of all) assert.ok(x.group !== 'boudoir' && !['twerk_bounce', 'body_wave', 'hip_circle', 'hip_eight'].includes(x.id), x.id);
  assert.equal(pack.poses.length, 30);
  assert.equal(pack.animations.length, 8);
});

test('MotionKit: alle Knochen existieren im Atelier-Rig, Keyframes sind zeitlich sortiert', () => {
  for (const p of pack.poses) for (const b of Object.keys(p.bones || {})) assert.ok(RIG.includes(b), `${p.id}: ${b}`);
  for (const a of pack.animations) {
    assert.ok(a.duration > 0, a.id);
    a.keyframes.forEach((k, i) => {
      if (i) assert.ok(k.t >= a.keyframes[i - 1].t, `${a.id} t`);
      for (const b of Object.keys(k.bones || {})) assert.ok(RIG.includes(b), `${a.id}: ${b}`);
    });
    for (const h of a.keyframes.flatMap((k) => Object.values(k.hands || {}))) assert.ok(pack.handShapes[h], `${a.id}: Handform ${h}`);
  }
  for (const p of pack.poses) for (const h of Object.values(p.hands || {})) assert.ok(pack.handShapes[h], `${p.id}: Handform ${h}`);
});

test('StudioPosePlayer setzt Winkel relativ zur Ruhepose und spiegelt Seiten', () => {
  const v = (x = 0, y = 0, z = 0) => ({ x, y, z, order: 'XYZ', set(a, b, c, o) { this.x = a; this.y = b; this.z = c; if (o) this.order = o; }, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; this.order = o.order; return this; }, clone() { return v(this.x, this.y, this.z); } });
  const bones = Object.fromEntries(RIG.map((n) => [n, { rotation: v(), position: v() }]));
  bones.tR.rotation.z = 0.35;
  const player = new StudioPosePlayer({ bones }, pack);
  player.apply('wave', 0, { strength: 1 });
  assert.ok(Math.abs(bones.shoulderR.rotation.z - (-135 * Math.PI / 180)) < 1e-9);
  player.apply('wave', 0, { strength: 1, mirror: true });
  assert.ok(Math.abs(bones.shoulderL.rotation.z - (135 * Math.PI / 180)) < 1e-9);
  assert.ok(Math.abs(bones.shoulderR.rotation.z) < 1e-9, 'Ruhepose vor jeder Anwendung');
  player.apply('knee_bounce', 0.5, { strength: 1 });
  assert.ok(bones.kneeL.rotation.x > 0.5);
  assert.deepEqual(player.missingBones('wave'), []);
  assert.throws(() => player.apply('twerk_bounce', 0), /unbekannte/);
});
