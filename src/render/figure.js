// Parametrische Basisfigur mit Rig, Gesicht, Haaren und den vier Kleidungsmodellen.
import * as THREE from 'three';
import { anatomy, makeSpline } from '../core/anatomy.js';
import { getGarment } from '../core/garments.js';
import { fabricState } from '../core/project.js';
import { rng } from '../core/appearance.js';
import { skinPoreNormal, skinBodyMap, faceMap, irisMap, hairStrandMap, weaveNormal, hexToRgb, mixRgb, hash } from './textures.js';

const V3 = THREE.Vector3;
const faceTexCache = new Map();

/** Rotationsprofil entlang -Y; profile: [[f, r], …] mit f in Segmentlängen. */
function lathe(profile, L, { seg = 40, samples = 48, sx = 1, sz = 1, open = false } = {}) {
  const sp = makeSpline(profile.map((p) => p[0]), profile.map((p) => p[1]));
  const f0 = profile[0][0], f1 = profile[profile.length - 1][0];
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const f = f0 + ((f1 - f0) * i) / samples;
    let r = Math.max(0, sp(f));
    if (!open && (i === 0 || i === samples)) r = 0;
    pts.push(new THREE.Vector2(Math.max(r, 1e-5), -f * L));
  }
  // LatheGeometry erwartet Punkte von unten nach oben für nach außen zeigende Normalen
  pts.reverse();
  const g = new THREE.LatheGeometry(pts, seg);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  return g;
}

/** Ringloft über Höhenbereich mit Querschnittsfunktion (x, z) = fn(y, θ). */
function loft(y0, y1, fn, { rings = 64, seg = 72, capBottom = false } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= rings; i++) {
    const y = y0 + ((y1 - y0) * i) / rings;
    for (let j = 0; j <= seg; j++) {
      const th = -Math.PI / 2 + (j / seg) * Math.PI * 2; // Naht hinten
      const [x, z] = fn(y, th);
      pos.push(x, y, z); uv.push(j / seg, i / rings);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (capBottom) {
    const ci = pos.length / 3; pos.push(0, y0, 0); uv.push(0.5, 0);
    for (let j = 0; j < seg; j++) idx.push(ci, j + 1, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (d2) => Math.exp(-d2);

export class Figure {
  constructor(profile) {
    this.root = new THREE.Group();
    this.root.name = 'Basisfigur';
    this.bones = {};
    this.stats = {};
    this.build(profile);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) for (const m of [].concat(o.material)) m.dispose();
    });
  }

  build(profile) {
    this.profile = profile;
    const app = profile.appearance;
    const A = (this.A = anatomy(profile.shape, app.face));
    this.makeRig(A);
    this.mats = this.makeMaterials(profile);
    this.buildBody(A, app);
    this.buildHead(A, app);
    this.buildHair(A, app);
    this.buildWear(A, profile);
    let tris = 0;
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
      tris += n * (o.isInstancedMesh ? o.count : 1);
    });
    this.stats.triangles = Math.round(tris);
  }

  makeRig(A) {
    const P = A.pivots;
    const tree = {
      hips: [null, P.hips], spine: ['hips', P.spine], chest: ['spine', P.chest], neck: ['chest', P.neck], head: ['neck', P.head],
      shoulderL: ['chest', P.shoulderL], elbowL: ['shoulderL', P.elbowL], wristL: ['elbowL', P.wristL],
      shoulderR: ['chest', P.shoulderR], elbowR: ['shoulderR', P.elbowR], wristR: ['elbowR', P.wristR],
      thighL: ['hips', P.thighL], kneeL: ['thighL', P.kneeL], ankleL: ['kneeL', P.ankleL],
      thighR: ['hips', P.thighR], kneeR: ['thighR', P.kneeR], ankleR: ['kneeR', P.ankleR],
    };
    this.pivotWorld = {};
    for (const [name, [parent, p]] of Object.entries(tree)) {
      const g = new THREE.Group(); g.name = name;
      const pp = parent ? tree[parent][1] : [0, 0, 0];
      g.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      (parent ? this.bones[parent] : this.root).add(g);
      this.bones[name] = g;
      this.pivotWorld[name] = new V3(...p);
    }
  }

  /** Mesh in Ruhepose-Weltkoordinaten an ein Gelenk hängen. */
  attach(bone, geom, mat, name) {
    const m = new THREE.Mesh(geom, mat);
    m.name = name || bone;
    const pw = this.pivotWorld[bone];
    m.position.set(-pw.x, -pw.y, -pw.z);
    this.bones[bone].add(m);
    return m;
  }

  makeMaterials(profile) {
    const app = profile.appearance;
    const pores = skinPoreNormal();
    const sheen = new THREE.Color().setRGB(...mixRgb(hexToRgb(app.skin), [255, 120, 100], 0.4).map((v) => v / 255), THREE.SRGBColorSpace);
    const skinParams = {
      roughness: 0.52, metalness: 0, normalMap: pores, normalScale: new THREE.Vector2(0.22, 0.22),
      sheen: 0.35, sheenRoughness: 0.55, sheenColor: sheen, clearcoat: 0.08, clearcoatRoughness: 0.55,
      specularIntensity: 0.55,
    };
    const body = new THREE.MeshPhysicalMaterial({ ...skinParams, map: skinBodyMap(app) });
    body.name = 'Haut_Koerper';
    return { body, skinParams, pores };
  }

  buildBody(A, app) {
    const M = this.mats.body;
    // Rumpf
    const y0 = A.rows[0].y, y1 = A.rows[A.rows.length - 1].y;
    const torso = loft(y0, y1, (y, th) => A.torsoPoint(y, th), { rings: 90, seg: 80, capBottom: true });
    this.attach('spine', torso, M, 'Rumpf');
    // Hals
    const neckR = Math.min(A.torsoW(A.neckBase), A.head.sx * 0.64);
    const neck = lathe([[-0.6, neckR * 1.05], [0, neckR], [0.6, neckR * 0.92], [1.3, neckR * 0.9]], A.neckLen, { open: true, sz: 0.95 });
    neck.rotateX(Math.PI); neck.translate(0, A.neckBase + A.neckLen * 0.05, 0.004);
    // Lathe ist entlang −Y aufgebaut; nach der Drehung zeigt es nach oben
    this.attach('neck', neck, M, 'Hals');
    // Beine
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const tg = lathe(A.legProfiles.thigh, A.hipJ - A.kneeY, { sz: 0.96 });
      tg.translate(sx * A.thighX, A.hipJ, 0);
      this.attach(`thigh${side}`, tg, M, `Oberschenkel_${side}`);
      const sg = lathe(A.legProfiles.shin, A.kneeY - A.ankleY, { sz: 1.05 });
      sg.translate(sx * A.thighX, A.kneeY, 0.004);
      this.attach(`knee${side}`, sg, M, `Unterschenkel_${side}`);
      this.attach(`ankle${side}`, this.footGeom(A, sx, 1), M, `Fuss_${side}`);
      // Arme
      const ua = lathe(A.legProfiles.upperArm, A.upperLen, { sz: 0.95 });
      ua.translate(sx * A.shoulderX, A.shoulderJY, -0.008 * A.s);
      this.attach(`shoulder${side}`, ua, M, `Oberarm_${side}`);
      const fa = lathe(A.legProfiles.foreArm, A.foreLen, { sx: 0.88, sz: 1.0 });
      fa.translate(sx * A.shoulderX, A.shoulderJY - A.upperLen, -0.012 * A.s);
      this.attach(`elbow${side}`, fa, M, `Unterarm_${side}`);
      this.buildHand(A, side, sx, M);
    }
  }

  footGeom(A, sx, inflate) {
    const L = A.footLen * inflate, s = A.s * inflate;
    const prof = [[0, 0], [0.03, 0.026], [0.12, 0.036], [0.4, 0.037], [0.7, 0.044], [0.88, 0.04], [0.97, 0.024], [1, 0]].map(([f, r]) => [f, r * s]);
    const g = lathe(prof, L, { seg: 32, sx: 1, sz: 0.62 });
    // entlang −Y aufgebaut → nach vorn (+Z) drehen
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const flat = -0.038 * s * 0.62 * 0.8;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      if (y < flat) y = flat;
      // Rist anheben, zur Ferse hin höher
      const z = pos.getZ(i);
      if (y > 0) y *= 1.25 - 0.5 * (z / L);
      pos.setY(i, y);
    }
    g.computeVertexNormals();
    const minY = flat;
    const P = this.pivotWorld[`ankle${sx > 0 ? 'L' : 'R'}`];
    g.translate(P.x + sx * 0.004, -minY + (inflate > 1 ? 0.0 : 0), P.z - 0.045 * A.s);
    return g;
  }

  buildHand(A, side, sx, M) {
    const P = this.pivotWorld[`wrist${side}`], s = A.s;
    const group = [];
    const palm = new THREE.SphereGeometry(1, 24, 16);
    palm.scale(0.016 * s, 0.05 * s, 0.041 * s);
    palm.translate(P.x - sx * 0.002, P.y - 0.045 * s, P.z + 0.002);
    for (const g of group) this.attach(`wrist${side}`, g, M, `Hand_${side}`);
    // Finger mit je zwei Gliedern (Grund- und Endglied) als eigene Gelenke → Gesten
    const fingerL = [0.074, 0.083, 0.078, 0.062];
    for (let i = 0; i < 4; i++) {
      const len = fingerL[i] * s;
      const r = 0.0082 * s * (i === 3 ? 0.85 : 1);
      const kx = P.x - sx * 0.004, ky = P.y - 0.088 * s, kz = P.z + (0.026 - i * 0.0175) * s;
      const prox = this.addBone(`f${side}${i}a`, `wrist${side}`, [kx, ky, kz]);
      const l1 = len * 0.55, l2 = len * 0.45;
      const g1 = new THREE.CapsuleGeometry(r, l1 - r, 4, 10); g1.translate(kx, ky - l1 / 2, kz);
      this.attach(prox, g1, M, `Finger_${side}${i}`);
      const dist = this.addBone(`f${side}${i}b`, prox, [kx, ky - l1, kz]);
      const g2 = new THREE.CapsuleGeometry(r * 0.92, l2 - r, 4, 10); g2.translate(kx, ky - l1 - l2 / 2, kz);
      this.attach(dist, g2, M, `Finger_${side}${i}`);
    }
    const tx = P.x - sx * 0.006, ty = P.y - 0.03 * s, tz = P.z + 0.032 * s;
    const thumb = this.addBone(`t${side}`, `wrist${side}`, [tx, ty, tz]);
    const th = new THREE.CapsuleGeometry(0.0095 * s, 0.045 * s, 4, 10);
    th.translate(tx, ty - 0.03 * s, tz);
    this.attach(thumb, th, M, `Daumen_${side}`);
    this.bones[thumb].rotation.set(-0.6, 0, -sx * 0.35);
    this.bones[thumb].userData.rest = this.bones[thumb].rotation.clone();
  }

  /** Zusätzliches Gelenk unter einem bestehenden (Ruhepose-Weltkoordinaten). */
  addBone(name, parent, p) {
    const g = new THREE.Group(); g.name = name;
    const pp = this.pivotWorld[parent];
    g.position.set(p[0] - pp.x, p[1] - pp.y, p[2] - pp.z);
    this.bones[parent].add(g);
    this.bones[name] = g;
    this.pivotWorld[name] = new V3(...p);
    return name;
  }

  // Kopf: deformierte UV-Kugel; Gesichtsregler formen Nase, Lippen, Kiefer, Wangen, Brauen
  headPoint(x, y, z, face, withSockets = true) {
    const f = (k) => (face[k] ?? 50) / 100;
    const H = this.A.head;
    let X = x, Y = y, Z = z;
    if (Z < 0) Z *= 1.1; // Hinterkopf
    // Gesicht abflachen
    if (Z > 0.62) Z = 0.62 + (Z - 0.62) * 0.8;
    // Schläfen leicht schmaler
    X *= 1 - 0.05 * gauss(((Y - 0.25) / 0.25) ** 2) * (Z > 0 ? Z : 0);
    // Kiefer & Kinn: Unterkiefer bleibt breit, Kinn abgerundet statt spitz
    const jawW = 0.7 + f('jaw') * 0.24;
    X *= 1 - (1 - jawW) * smooth(-0.15, -0.75, Y);
    const chinW = 0.9 + f('chin') * 0.1;
    if (Y < -0.75) X *= chinW + (1 - chinW) * (1 - smooth(-0.75, -1, Y));
    if (Y < -0.2 && Z > 0) Z *= 1 - 0.1 * smooth(-0.2, -1, Y);
    Y -= 0.06 * (f('chin') - 0.5) * smooth(-0.6, -1, Y);
    Z += 0.1 * f('chin') * gauss((X / 0.3) ** 2 + ((Y + 0.85) / 0.13) ** 2) * (Z > 0 ? 1 : 0);
    // Wangenknochen
    for (const s of [-1, 1]) {
      const g = gauss(((X - s * 0.6) / 0.26) ** 2 + ((Y + 0.1) / 0.17) ** 2) * (Z > 0.2 ? 1 : 0);
      X += s * g * 0.035 * f('cheekbones'); Z += g * 0.035 * f('cheekbones');
    }
    if (Z > 0) {
      // Brauenbogen
      Z += 0.06 * f('browRidge') * gauss((X / 0.5) ** 4 + ((Y - 0.2) / 0.08) ** 2);
      // Nase
      const nw = 0.1 + f('noseWidth') * 0.07;
      const ylen = 0.32 + f('noseLength') * 0.1;
      const tipY = -ylen;
      let prof = 0;
      if (Y < 0.12 && Y > tipY - 0.1) {
        const t = (0.12 - Y) / (0.12 - tipY); // 0 oben, 1 an der Spitze
        prof = t <= 1 ? (0.12 + 0.3 * f('noseBridge')) * (1 - t) * 0.6 + t * t * 1.0 : Math.max(0, 1 - (t - 1) * 4.5);
        prof *= 0.3;
      }
      Z += prof * gauss((X / (nw * (0.5 + 0.6 * Math.min(1, (0.12 - Y) / 0.5)))) ** 2);
      for (const s of [-1, 1]) Z += 0.045 * gauss(((X - s * nw * 0.95) / 0.06) ** 2 + ((Y - tipY - 0.02) / 0.05) ** 2) * (0.6 + f('noseWidth'));
      // Lippen
      const lf = 0.6 + f('lipFullness') * 0.8;
      Z += 0.05 * lf * gauss((X / 0.26) ** 2 + ((Y + 0.52) / (0.045 * lf)) ** 2);
      Z += 0.055 * lf * gauss((X / 0.24) ** 2 + ((Y + 0.61) / (0.05 * lf)) ** 2);
      Z -= 0.03 * gauss((X / 0.22) ** 2 + ((Y + 0.565) / 0.012) ** 2);
      // Augenhöhlen
      if (withSockets) for (const s of [-1, 1]) {
        Z -= 0.05 * gauss(((X - s * this.eyeX) / 0.17) ** 2 + ((Y - this.eyeY) / 0.11) ** 2);
      }
    }
    return new V3(X * H.sx, Y * H.sy, Z * H.sz);
  }

  buildHead(A, app) {
    const face = app.face;
    const f = (k) => (face[k] ?? 50) / 100;
    this.eyeX = 0.36 + f('eyeSpacing') * 0.1;
    this.eyeY = 0.04;
    const C = new V3(0, A.headCenterY, 0.012 * A.s);
    const sphere = new THREE.SphereGeometry(1, 128, 96);
    const pos = sphere.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = this.headPoint(pos.getX(i), pos.getY(i), pos.getZ(i), face);
      pos.setXYZ(i, p.x + C.x, p.y + C.y, p.z + C.z);
    }
    sphere.computeVertexNormals();
    const key = JSON.stringify([app.skin, app.undertone, app.hairColor, app.freckles, face.lipFullness, face.browRidge, this.eyeX]);
    let fmap = faceTexCache.get(key);
    if (!fmap) { fmap = faceMap(app, this.eyeX, this.eyeY); faceTexCache.set(key, fmap); if (faceTexCache.size > 12) faceTexCache.delete(faceTexCache.keys().next().value); }
    const headMat = new THREE.MeshPhysicalMaterial({ ...this.mats.skinParams, map: fmap, normalScale: new THREE.Vector2(0.12, 0.12) });
    headMat.name = 'Haut_Kopf';
    this.attach('head', sphere, headMat, 'Kopf');

    // Ohren
    for (const s of [-1, 1]) {
      const ear = new THREE.SphereGeometry(1, 20, 16);
      ear.scale(0.011 * A.s, 0.031 * A.s, 0.019 * A.s);
      ear.rotateY(s * 0.35);
      ear.translate(C.x + s * A.head.sx * 0.97, C.y - A.head.sy * 0.04, C.z - A.head.sz * 0.08);
      this.attach('head', ear, this.mats.body, 'Ohr');
    }

    // Augen
    const eyeR = 0.0112 * A.s * (0.9 + f('eyeSize') * 0.2);
    const sclera = new THREE.MeshPhysicalMaterial({ map: irisMap(app.eyeColor), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 0.8 });
    sclera.name = 'Auge';
    const lidMat = new THREE.MeshPhysicalMaterial({ ...this.mats.skinParams, map: null, color: new THREE.Color(app.skin).multiplyScalar(0.93) });
    for (const s of [-1, 1]) {
      const nx = s * this.eyeX, ny = this.eyeY, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const surf = this.headPoint(nx, ny, nz, face, false);
      const c = new V3(surf.x + C.x, surf.y + C.y, surf.z + C.z - eyeR * 0.62);
      const eye = new THREE.SphereGeometry(eyeR, 32, 24);
      // Iris (Textur-Mitte) nach vorn drehen: Kugel-UV u=0.25 zeigt nach +Z
      eye.rotateY(0);
      const uv = eye.attributes.uv;
      // planare Projektion von vorn für die Iris-Textur
      const ep = eye.attributes.position;
      for (let i = 0; i < ep.count; i++) {
        const z = ep.getZ(i);
        uv.setXY(i, z > 0 ? 0.5 + (ep.getX(i) / eyeR) * 0.5 * 0.92 : 0.02, z > 0 ? 0.5 + (ep.getY(i) / eyeR) * 0.5 * 0.92 : 0.02);
      }
      eye.translate(c.x, c.y, c.z);
      const em = this.attach('head', eye, sclera, 'Auge');
      em.castShadow = false;
      // Oberlid: Kugelschale, Lidfalte bestimmt die Bedeckung
      const cover = 0.33 + f('lidFold') * 0.12;
      const lid = new THREE.SphereGeometry(eyeR * 1.06, 32, 16, 0, Math.PI * 2, 0, Math.PI * cover);
      lid.rotateX(0.05);
      // Epikanthus: inneren Lidwinkel leicht absenken
      const lp = lid.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const lx = lp.getX(i) * s; // innen = negative Werte
        if (lx < 0) lp.setY(i, lp.getY(i) - f('lidFold') * 0.25 * eyeR * smooth(0, -eyeR, lx));
      }
      lid.translate(c.x, c.y, c.z);
      this.attach('head', lid, lidMat, 'Oberlid');
      const low = new THREE.SphereGeometry(eyeR * 1.04, 32, 8, 0, Math.PI * 2, Math.PI * 0.66, Math.PI * 0.34);
      low.translate(c.x, c.y, c.z);
      this.attach('head', low, lidMat, 'Unterlid');
    }
    this.headC = C;
  }

  // ----- Haare -----------------------------------------------------------------------
  hairMask(x, y, z) {
    // Haaransatz: vorne hoch, an den Seiten über den Ohren, hinten im Nacken
    const front = 0.5 - 0.22 * Math.abs(x);
    const side = 0.16;
    const back = -0.55;
    const zt = (z + 1) / 2;
    let thr = zt > 0.5 ? side + (front - side) * smooth(0.5, 0.95, zt) : back + (side - back) * smooth(0.0, 0.5, zt);
    if (Math.abs(x) > 0.75 && zt > 0.3 && zt < 0.7) thr = Math.max(thr, 0.15); // Ohren frei
    return smooth(thr - 0.06, thr + 0.04, y);
  }

  pushOut(v, margin) {
    // Kollision mit Rumpf/Schultern: Punkt radial aus dem Rumpfquerschnitt schieben
    const A = this.A;
    if (v.y > A.neckBase + 0.02 || v.y < A.crotchY) return v;
    const w = A.torsoW(v.y) + margin, d = A.torsoD(v.y) + margin + (v.z > 0 ? A.bumps.bust.amp * 0.8 : 0);
    const e = (v.x / w) ** 2 + (v.z / d) ** 2;
    if (e < 1) { const k = 1 / Math.sqrt(Math.max(e, 1e-4)); v.x *= k; v.z *= k; }
    return v;
  }

  buildHair(A, app) {
    const C = this.headC, H = A.head, s = A.s;
    const strands = hairStrandMap(app.hairColor, app.hairTexture);
    const hairCol = new THREE.Color(app.hairColor);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, map: strands, roughness: 0.42, sheen: 0.6, sheenRoughness: 0.35,
      sheenColor: hairCol.clone().lerp(new THREE.Color('#fff3dc'), 0.35), side: THREE.DoubleSide,
      anisotropy: 0.6, specularIntensity: 0.6,
    });
    mat.name = 'Haar';
    const style = app.hairStyle, tex = app.hairTexture;
    const volume = style === 'buzz' ? 1.015 : tex === 'straight' ? 1.06 : 1.09;

    // Kappe
    const cap = new THREE.SphereGeometry(1, 96, 64);
    const cp = cap.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
      const m = this.hairMask(x, y, z);
      // Mittelscheitel: entlang x≈0 vorne-oben weniger Volumen
      const part = style === 'buzz' || style === 'afro' ? 0 : gauss((x / 0.06) ** 2) * smooth(0.0, 0.6, z) * smooth(0.2, 0.7, y);
      const k = 0.94 + (volume - 0.94) * m * (1 - 0.75 * part) + (y > 0 ? 0.03 * y * m * (style === 'buzz' ? 0 : 1) : 0);
      const base = this.headPoint(x, y, z, app.face, false);
      const n = new V3(x * H.sx, y * H.sy, (z < 0 ? z * 1.1 : z) * H.sz);
      // Am Haaransatz läuft die Kappe flach auf der Haut aus (keine sichtbare Stufe)
      const taper = smooth(0.0, 0.85, m);
      const p = m < 0.02 ? base.clone().multiplyScalar(0.97) : base.clone().add(n.multiplyScalar((k - 0.94) * taper + 0.002));
      cp.setXYZ(i, p.x + C.x, p.y + C.y, p.z + C.z);
    }
    cap.computeVertexNormals();
    const capMat = mat.clone(); capMat.side = THREE.FrontSide;
    this.attach('head', cap, capMat, 'Haar_Kappe');

    const length = { long: A.shoulderY - 0.24 * s, shoulder: A.shoulderY - 0.02 * s, short: C.y - H.sy * 0.55, bun: null, afro: null, braids: A.shoulderY - 0.28 * s, buzz: null }[style];

    if ((tex === 'straight' || tex === 'wavy') && length && style !== 'braids') {
      this.attach('head', this.hairDrape(A, app, length), mat, 'Haar_Laengen');
    }
    if ((tex === 'curly' || tex === 'coily') && style !== 'buzz') {
      const mesh = this.hairCurls(A, app, style === 'afro' || tex === 'coily' && style !== 'braids' && style !== 'short' && style !== 'bun' ? 'afro' : style, length);
      this.bones.head.add(mesh);
      mesh.position.sub(this.pivotWorld.head);
    }
    if (style === 'bun') {
      const bun = new THREE.SphereGeometry(0.048 * s, 32, 24);
      bun.scale(1, 0.85, 0.9);
      bun.translate(C.x, C.y + H.sy * 0.55, C.z - H.sz * 0.95);
      this.attach('head', bun, capMat, 'Haar_Dutt');
    }
    if (style === 'braids') {
      const r = rng(hash(app.hairColor));
      for (let b = 0; b < 8; b++) {
        const a = -0.9 + (b / 7) * 1.8;
        const pts = [];
        for (let t = 0; t <= 1.0001; t += 0.05) {
          const y = C.y - H.sy * 0.2 - t * (C.y - length);
          const v = new V3(Math.sin(a) * H.sx * 1.05 * (1 + t * 0.5), y, -Math.cos(a) * H.sz * 1.1 - 0.01 - t * 0.02);
          this.pushOut(v, 0.03);
          pts.push(v);
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const geo = new THREE.TubeGeometry(curve, 60, 0.0075 * s * (0.9 + r() * 0.2), 8, false);
        this.attach('head', geo, capMat, 'Haar_Zopf');
      }
    }
  }

  hairDrape(A, app, endY) {
    const C = this.headC, H = A.head;
    const wavy = app.hairTexture === 'wavy';
    const rows = 70, cols = 80, maxA = 2.05; // ±117°
    const pos = [], uv = [], idx = [];
    const startY = C.y + H.sy * 0.25;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const y = startY - t * (startY - endY);
      const headBlend = smooth(C.y - H.sy * 0.9, C.y + H.sy * 0.3, y);
      for (let j = 0; j <= cols; j++) {
        const u = j / cols, a = -maxA + u * 2 * maxA;
        // seitliche Strähnen enden früher (Stufung)
        const rx = H.sx * 1.12 * headBlend + (1 - headBlend) * (H.sx * 1.25 + t * 0.03);
        const rz = H.sz * 1.15 * headBlend + (1 - headBlend) * (H.sz * 1.0 + 0.01);
        const v = new V3(Math.sin(a) * rx, y, -Math.cos(a) * rz + C.z * 0.4);
        if (wavy) {
          const w = Math.sin(t * 22 + a * 3) * 0.006 * smooth(0.15, 0.5, t);
          v.x += Math.sin(a) * w; v.z -= Math.cos(a) * w;
        }
        this.pushOut(v, 0.022);
        pos.push(v.x, v.y, v.z); uv.push(u * 3, 1 - t);
      }
    }
    const row = cols + 1;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  hairCurls(A, app, mode, endY) {
    const C = this.headC, H = A.head, s = A.s;
    const r = rng(hash(app.hairColor + mode) ^ 99);
    const coily = app.hairTexture === 'coily';
    let curl;
    if (coily) curl = new THREE.IcosahedronGeometry(0.0135 * s, 0);
    else {
      // kurze Spirallocke (Helix) statt Ring
      const turns = 1.6, R = 0.0075 * s, L = 0.034 * s;
      const pts = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * turns * Math.PI * 2; pts.push(new V3(Math.cos(a) * R, -t * L + L / 2, Math.sin(a) * R)); }
      curl = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0024 * s, 4, false);
    }
    const pts = [];
    const add = (v, sc) => pts.push([v, sc]);
    const capCount = coily ? 1500 : 800;
    const outer = mode === 'afro' ? 1.55 : 1.14;
    for (let i = 0; i < capCount; i++) {
      // Gleichverteilt auf der Kugel, nur im Haarbereich
      const y = r() * 2 - 1, a = r() * Math.PI * 2, rr = Math.sqrt(1 - y * y);
      const x = rr * Math.cos(a), z = rr * Math.sin(a);
      if (this.hairMask(x, y, z) < 0.5) continue;
      const k = 1.02 + r() * (outer - 1.02) * (mode === 'afro' ? 1 : 0.8);
      const v = new V3(x * H.sx * k, y * H.sy * k + (mode === 'afro' ? H.sy * 0.15 * (k - 1) : 0), (z < 0 ? z * 1.1 : z) * H.sz * k);
      add(v.add(C), 0.8 + r() * 0.6);
    }
    if (endY && !['afro', 'short', 'bun', 'braids'].includes(mode)) {
      const n = coily ? 2200 : 1400;
      for (let i = 0; i < n; i++) {
        const t = Math.pow(r(), 0.85);
        const y = C.y - t * (C.y - endY);
        const a = (r() * 2 - 1) * 2.0;
        const spread = 1 + t * 0.9 + r() * 0.25; // nach unten voluminöser
        const v = new V3(Math.sin(a) * H.sx * 1.2 * spread, y, -Math.cos(a) * H.sz * 1.05 * spread + C.z * 0.3);
        if (Math.abs(a) > 1.45 && y > C.y - H.sy * 1.05) continue; // Gesicht frei
        this.pushOut(v, 0.03 + r() * 0.03);
        add(v, (0.85 + r() * 0.55) * (1 - t * 0.15));
      }
    }
    const mesh = new THREE.InstancedMesh(curl, new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.48, sheen: 0.7, sheenRoughness: 0.35,
      sheenColor: new THREE.Color(app.hairColor).lerp(new THREE.Color('#fff0d8'), 0.4), specularIntensity: 0.5,
    }), pts.length);
    mesh.name = 'Haar_Locken';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3();
    const base = new THREE.Color(app.hairColor), c = new THREE.Color();
    pts.forEach(([v, k], i) => {
      e.set(r() * 6.28, r() * 6.28, r() * 6.28); q.setFromEuler(e); sc.setScalar(k);
      m.compose(v, q, sc); mesh.setMatrixAt(i, m);
      c.copy(base).multiplyScalar(0.72 + r() * 0.5); mesh.setColorAt(i, c);
    });
    mesh.castShadow = true;
    return mesh;
  }

  // ----- Kleidung ---------------------------------------------------------------------
  garmentMaterial(garmentId, color) {
    const f = fabricState(this.profile, garmentId);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color), roughness: f.roughness, metalness: 0,
      normalMap: weaveNormal(f.weave), normalScale: new THREE.Vector2(0.6, 0.6),
      sheen: f.sheen, sheenRoughness: 0.5, sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.4),
      side: THREE.DoubleSide,
    });
    mat.name = `Stoff_${garmentId}`;
    mat.userData.garment = garmentId;
    return mat;
  }

  buildWear(A, profile) {
    const w = profile.wear;
    this.garmentMeshes = {};
    this.stats.garments = {};
    if (w.bottom.item !== 'none' && getGarment(w.bottom.item)) this.buildBottom(A, getGarment(w.bottom.item), w.bottom.color);
    if (w.top.item !== 'none' && getGarment(w.top.item)) this.buildTop(A, getGarment(w.top.item), w.top.color);
    if (w.shoes.item !== 'none') this.buildShoes(A, w.shoes.color);
    if (w.glasses.item !== 'none') this.buildGlasses(A, w.glasses.color);
  }

  register(gid, meshes) {
    this.garmentMeshes[gid] = meshes;
    let area = 0, verts = 0;
    for (const m of meshes) { area += meshArea(m.geometry); verts += m.geometry.attributes.position.count; }
    this.stats.garments[gid] = { areaM2: Math.round(area * 10000) / 10000, vertexCount: verts };
  }

  buildTop(A, g, color) {
    const mat = this.garmentMaterial(g.id, color);
    const f = fabricState(this.profile, g.id);
    const off = g.ease + f.thicknessMm / 1000 + 0.003;
    const hemF = g.id === 'sweater' ? 0.03 : 0.07;
    const topF = g.id === 'sweater' ? 0.955 : 0.945;
    const y0 = A.torsoY(hemF), y1 = A.torsoY(topF);
    const loose = g.id === 'sweater' ? 0.008 : 0.004;
    const meshes = [];
    const body = loft(y0, y1, (y, th) => {
      // unten etwas weiter fallen lassen, oben eng am Halsausschnitt
      const extra = loose * smooth(A.torsoY(0.5), y0, y);
      return A.torsoPoint(y, th, { offset: off + extra, bridgeBust: true });
    }, { rings: 80, seg: 80 });
    meshes.push(this.attach('spine', body, mat, `${g.label}_Rumpf`));
    // Bündchen / Kragen
    const rib = (y, extra, h) => {
      const geo = loft(y - h / 2, y + h / 2, (yy, th) => A.torsoPoint(y, th, { offset: off + extra, bridgeBust: true }), { rings: 4, seg: 80 });
      return geo;
    };
    meshes.push(this.attach('spine', rib(y1 - 0.005 * A.s, 0.003, 0.012 * A.s), mat, `${g.label}_Kragen`));
    if (g.id === 'sweater') meshes.push(this.attach('spine', rib(y0 + 0.02 * A.s, 0.008, 0.04 * A.s), mat, `${g.label}_Bund`));
    // Ärmel
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const prof = A.legProfiles.upperArm;
      const end = g.sleeve === 'long' ? 1.06 : 0.42;
      const sleeveOff = f.thicknessMm / 1000 + 0.005 + g.ease * 0.25;
      const sl = garmentTube(prof, -0.1, end, sleeveOff, (t) => (g.sleeve === 'short' ? 0.01 * t : 0.002));
      const geo = lathe(sl, A.upperLen, { open: true, sz: 0.97 });
      geo.translate(sx * A.shoulderX, A.shoulderJY, -0.008 * A.s);
      meshes.push(this.attach(`shoulder${side}`, geo, mat, `${g.label}_Aermel_${side}`));
      if (g.sleeve === 'long') {
        const fp = garmentTube(A.legProfiles.foreArm, -0.06, 0.93, sleeveOff, (t) => 0.003 - 0.002 * t);
        const fg = lathe(fp, A.foreLen, { open: true, sx: 0.92 });
        fg.translate(sx * A.shoulderX, A.shoulderJY - A.upperLen, -0.012 * A.s);
        meshes.push(this.attach(`elbow${side}`, fg, mat, `${g.label}_Unterarm_${side}`));
        const cuffR = A.radiusAt(A.legProfiles.foreArm, 0.93) + sleeveOff + 0.002;
        const cuff = new THREE.CylinderGeometry(cuffR, cuffR * 0.98, 0.045 * A.s, 40, 1, true);
        cuff.translate(sx * A.shoulderX, A.shoulderJY - A.upperLen - A.foreLen * 0.9, -0.012 * A.s);
        meshes.push(this.attach(`elbow${side}`, cuff, mat, `${g.label}_Manschette_${side}`));
      }
    }
    this.register(g.id, meshes);
  }

  buildBottom(A, g, color) {
    const mat = this.garmentMaterial(g.id, color);
    const f = fabricState(this.profile, g.id);
    const off = g.ease + f.thicknessMm / 1000 + 0.003;
    const meshes = [];
    const yTop = A.torsoY(0.3), yBot = A.rows[0].y;
    const pelvis = loft(yBot, yTop, (y, th) => A.torsoPoint(y, th, { offset: off + (g.id === 'cargo' ? 0.006 : 0) }), { rings: 50, seg: 80, capBottom: true });
    meshes.push(this.attach('spine', pelvis, mat, `${g.label}_Becken`));
    const band = loft(yTop - 0.035 * A.s, yTop, (y, th) => A.torsoPoint(yTop - 0.017 * A.s, th, { offset: off + 0.004 }), { rings: 3, seg: 80 });
    meshes.push(this.attach('spine', band, mat, `${g.label}_Bund`));
    const wide = g.leg === 'wide';
    const kneeR = A.radiusAt(A.legProfiles.thigh, 1.0);
    const minR = kneeR + off + (wide ? 0.03 : 0.014);
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const tp = garmentTube(A.legProfiles.thigh, -0.14, 1.1, off + (wide ? 0.012 : 0.004), () => 0, (f2, r) => Math.max(r, f2 > 0.3 ? minR : r));
      const tg = lathe(tp, A.hipJ - A.kneeY, { open: true, sz: 0.97 });
      tg.translate(sx * A.thighX, A.hipJ, 0);
      meshes.push(this.attach(`thigh${side}`, tg, mat, `${g.label}_Bein_${side}`));
      const sp = [[-0.1, minR], [0.4, minR * (wide ? 0.98 : 0.94)], [0.86, minR * (wide ? 0.9 : 0.88)], [0.9, minR * (wide ? 0.82 : 0.88)]];
      const sg = lathe(sp, A.kneeY - A.ankleY, { open: true, sz: 1.0 });
      sg.translate(sx * A.thighX, A.kneeY, 0.004);
      meshes.push(this.attach(`knee${side}`, sg, mat, `${g.label}_Unterbein_${side}`));
      if (g.pockets) {
        const pr = A.radiusAt(tp, 0.45);
        const pocket = new THREE.BoxGeometry(0.024 * A.s, 0.15 * A.s, 0.13 * A.s);
        pocket.translate(sx * (A.thighX + pr + 0.006), A.hipJ - (A.hipJ - A.kneeY) * 0.5, 0.0);
        meshes.push(this.attach(`thigh${side}`, pocket, mat, `${g.label}_Tasche_${side}`));
        const flap = new THREE.BoxGeometry(0.028 * A.s, 0.035 * A.s, 0.135 * A.s);
        flap.translate(sx * (A.thighX + pr + 0.008), A.hipJ - (A.hipJ - A.kneeY) * 0.5 + 0.075 * A.s, 0.0);
        meshes.push(this.attach(`thigh${side}`, flap, mat, `${g.label}_Patte_${side}`));
      }
    }
    this.register(g.id, meshes);
  }

  buildShoes(A, color) {
    const upper = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.7, sheen: 0.2 });
    upper.name = 'Schuh';
    const soleM = new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.8 });
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const g = this.footGeom(A, sx, 1.14);
      g.translate(0, 0.012 * A.s, -0.006 * A.s);
      this.attach(`ankle${side}`, g, upper, `Schuh_${side}`);
      const P = this.pivotWorld[`ankle${side}`];
      const sole = new THREE.CapsuleGeometry(0.046 * A.s, A.footLen * 0.95, 4, 16);
      sole.rotateX(Math.PI / 2); sole.scale(1, 0.3, 1);
      sole.translate(P.x + sx * 0.004, 0.011 * A.s, P.z - 0.045 * A.s + A.footLen * 0.55);
      this.attach(`ankle${side}`, sole, soleM, `Sohle_${side}`);
    }
  }

  buildGlasses(A, color) {
    const C = this.headC, H = A.head;
    const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.3, clearcoat: 0.8 });
    mat.name = 'Brille';
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 0.95, thickness: 0.002, transparent: true, opacity: 0.25 });
    const ringR = 0.022 * A.s;
    const zf = C.z + H.sz * 0.98;
    for (const s of [-1, 1]) {
      const x = s * this.eyeX * H.sx * 1.02, y = C.y + this.eyeY * H.sy;
      const ring = new THREE.TorusGeometry(ringR, 0.0016 * A.s, 10, 48);
      ring.translate(x, y, zf);
      this.attach('head', ring, mat, 'Brille_Rahmen');
      const lens = new THREE.CircleGeometry(ringR, 32);
      lens.translate(x, y, zf);
      this.attach('head', lens, glass, 'Brille_Glas');
      const temple = new THREE.BoxGeometry(0.0025 * A.s, 0.003 * A.s, H.sz * 1.05);
      temple.translate(s * (H.sx * 1.02), y + 0.002, zf - H.sz * 0.52);
      this.attach('head', temple, mat, 'Brille_Buegel');
    }
    const bridge = new THREE.TorusGeometry(this.eyeX * H.sx * 1.02 - ringR, 0.0014 * A.s, 8, 16, Math.PI);
    bridge.translate(0, C.y + this.eyeY * H.sy + 0.002, zf + 0.002);
    this.attach('head', bridge, mat, 'Brille_Steg');
  }

  /** Nur Stoffmaterial neu setzen (Rauheit/Glanz/Struktur), ohne Geometrie neu zu bauen. */
  refreshFabric(garmentId) {
    const meshes = this.garmentMeshes?.[garmentId];
    if (!meshes) return false;
    const f = fabricState(this.profile, garmentId);
    for (const m of meshes) {
      m.material.roughness = f.roughness;
      m.material.sheen = f.sheen;
      m.material.normalMap = weaveNormal(f.weave);
      m.material.needsUpdate = true;
    }
    return true;
  }
}

/** Kleidungsrohr aus Körperprofil + Abstand; offene Enden. */
function garmentTube(profile, f0, f1, off, extra = () => 0, adjust = (f, r) => r) {
  const sp = makeSpline(profile.map((p) => p[0]), profile.map((p) => p[1]));
  const out = [];
  const n = 24;
  let maxR = 0;
  for (let i = 0; i <= n; i++) {
    const f = f0 + ((f1 - f0) * i) / n;
    const t = i / n;
    // obere Kappe: Körperradius nicht unter 60 % des Maximums fallen lassen (Schulter/Hüfte überdecken)
    let r = Math.max(sp(f), i < n / 4 ? maxR * 0.35 : 0) + off + extra(t);
    maxR = Math.max(maxR, sp(f));
    out.push([f, adjust(f, r)]);
  }
  return out;
}

export function meshArea(geo) {
  const p = geo.attributes.position, idx = geo.index;
  const a = new V3(), b = new V3(), c = new V3();
  let area = 0;
  const tri = (i, j, k) => {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, j); c.fromBufferAttribute(p, k);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  };
  if (idx) for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  else for (let i = 0; i < p.count; i += 3) tri(i, i + 1, i + 2);
  return area;
}
