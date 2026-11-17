// Parametrische Anatomie: alle Maße in Metern, Y nach oben, Blickrichtung +Z,
// linke Körperseite der Figur = +X. Reine Funktionen – im Browser und in Tests nutzbar.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Monotone kubische Interpolation (Fritsch–Carlson) über (x, y)-Stützstellen. */
export function makeSpline(xs, ys) {
  const n = xs.length;
  const d = new Array(n - 1), m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/**
 * Berechnet Skelett-Drehpunkte, Segmentlängen und Querschnittsfunktionen.
 * @param {object} shape  Körperform (siehe project.DEFAULT_SHAPE)
 * @param {object} [face] Gesichtsregler (für Kopfmaße)
 */
export function anatomy(shape, face = {}) {
  const H = shape.heightCm / 100;
  const s = H / 1.70;
  const bmi = shape.weightKg / (H * H);
  const girth = clamp(Math.sqrt(bmi / 21.5), 0.78, 1.5);
  const mus = shape.muscle / 100;
  const pct = (k) => (shape[k] ?? 100) / 100;
  const legS = pct('legLength'), torS = pct('torsoLength');
  const headS = pct('head') * Math.pow(s, 0.45);
  const faceLen = 0.94 + ((face.faceLength ?? 50) / 100) * 0.12;

  const head = { sx: 0.074 * headS, sy: 0.112 * headS * faceLen, sz: 0.094 * headS };
  const headCenterY = H - head.sy;
  const chinY = headCenterY - head.sy * 0.92;
  const neckLen = 0.062 * s * Math.pow(pct('neck'), 0.5);
  const neckBase = chinY - neckLen;
  const shoulderY = neckBase - 0.022 * s;

  // Beinlänge verschiebt das Hüftgelenk; Rumpflänge kompensiert gegenläufig
  const hipJ = H * (0.505 * legS) - (torS - 1) * 0.12 * s;
  const crotchY = hipJ - 0.05 * s;
  const ankleY = 0.068 * s;
  const kneeY = ankleY + (hipJ - ankleY) * 0.49;
  const torsoL = neckBase - crotchY;

  const shoulderX = 0.162 * s * pct('shoulders') * (1 + mus * 0.05);
  const shoulderJY = shoulderY - 0.042 * s;
  const upperLen = 0.186 * H;
  const foreLen = 0.146 * H;
  const handLen = 0.105 * H;
  const thighX = 0.086 * s * Math.pow(pct('hips'), 0.8) * Math.pow(girth, 0.35);
  const footLen = 0.142 * H * pct('feet');

  const g = girth, gs = Math.sqrt(girth);
  const W = (v) => v * s;
  // Rumpfquerschnitte: f = Anteil der Rumpflänge ab Schritt, w = halbe Breite, d = halbe Tiefe
  const rows = [
    [-0.075, W(0.022) * g, W(0.016) * g],
    [-0.04, W(0.10) * g, W(0.055) * g],
    [0.0, W(0.150) * g * pct('hips'), W(0.090) * g],
    [0.10, W(0.170) * g * pct('hips'), W(0.104) * g],
    [0.22, W(0.158) * g * Math.sqrt(pct('hips') * pct('waist')), W(0.098) * g],
    [0.37, W(0.128) * g * pct('waist'), W(0.088) * g * Math.sqrt(pct('waist'))],
    [0.52, W(0.136) * g, W(0.094) * gs],
    [0.62, W(0.148) * gs, W(0.098) * gs],
    [0.74, W(0.158) * gs * pct('shoulders'), W(0.094) * gs],
    [0.85, W(0.170) * pct('shoulders') * (1 + mus * 0.06), W(0.082) * gs],
    [0.915, W(0.140) * pct('shoulders'), W(0.068) * gs],
    [0.96, W(0.090) * pct('neck'), W(0.056) * pct('neck')],
    [1.0, W(0.050) * pct('neck'), W(0.046) * pct('neck')],
    [1.08, W(0.047) * pct('neck'), W(0.044) * pct('neck')],
  ];
  const fy = rows.map((r) => crotchY + r[0] * torsoL);
  const wS = makeSpline(fy, rows.map((r) => r[1]));
  const dS = makeSpline(fy, rows.map((r) => r[2]));

  const bustAmp = W(0.034) * Math.pow(pct('bust'), 1.6) * gs - W(0.012);
  const bumps = {
    bust: { y: crotchY + 0.605 * torsoL, x: W(0.083) * gs, sx: W(0.058) * gs, sy: W(0.066) * gs, amp: Math.max(0, bustAmp), side: 1 },
    glutes: { y: crotchY + 0.06 * torsoL, x: W(0.072) * g, sx: W(0.07) * g, sy: W(0.085), amp: W(0.026) * pct('glutes') * g, side: -1 },
    stomach: { y: crotchY + 0.27 * torsoL, x: 0, sx: W(0.12) * g, sy: W(0.13), amp: Math.max(0, W(0.022) * (pct('stomach') * g * g - 0.85)), side: 1 },
    chest: { y: crotchY + 0.70 * torsoL, x: W(0.07), sx: W(0.07), sy: W(0.06), amp: W(0.012) * mus, side: 1 },
  };

  const thighR = W(0.086) * pct('thighs') * Math.pow(g, 0.9);
  const legProfiles = {
    thigh: [[-0.17, 0.0], [-0.13, 0.55], [-0.06, 0.94], [0, 1], [0.25, 0.91], [0.55, 0.76], [0.85, 0.6], [1.0, 0.55], [1.07, 0.47], [1.12, 0.0]]
      .map(([f, r]) => [f, r * thighR]),
    shin: [[-0.08, 0], [-0.06, W(0.034)], [-0.02, W(0.046) * gs], [0.05, W(0.047) * gs], [0.25, W(0.053) * pct('calves') * Math.pow(g, 0.7) * (1 + mus * 0.06)],
      [0.45, W(0.047) * pct('calves') * gs], [0.75, W(0.033) * gs], [0.95, W(0.028)], [1.03, W(0.026)], [1.08, 0]],
    upperArm: [[-0.12, 0], [-0.09, W(0.03)], [-0.04, W(0.046) * gs * (1 + mus * 0.1)], [0, W(0.047) * gs * (1 + mus * 0.1)],
      [0.3, W(0.043) * pct('arms') * Math.pow(g, 0.8) * (1 + mus * 0.12)], [0.7, W(0.036) * pct('arms') * gs], [0.95, W(0.031)], [1.05, W(0.028)], [1.1, 0]],
    foreArm: [[-0.07, 0], [-0.045, W(0.024)], [0, W(0.031) * gs], [0.2, W(0.035) * pct('arms') * gs * (1 + mus * 0.08)], [0.6, W(0.027) * gs], [0.95, W(0.022)], [1.04, W(0.02)], [1.08, 0]],
  };

  /** Ring-Querschnitt des Rumpfs auf Höhe y bei Winkel θ (0 = +X, π/2 = +Z vorne). */
  function torsoPoint(y, theta, { offset = 0, bridgeBust = false, n } = {}) {
    const w = wS(y) + offset, d = dS(y) + offset;
    // Rumpf leicht kastig, Schultern/Hals rund
    if (n === undefined) n = 2.35 - 0.4 * Math.min(1, Math.max(0, (y - (crotchY + 0.78 * torsoL)) / (0.12 * torsoL)));
    const c = Math.cos(theta), sn = Math.sin(theta);
    let x = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    let z = d * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n) * (sn < 0 ? 0.96 : 1);
    z += bumpZ(x, y, z, bridgeBust);
    return [x, z];
  }

  function bumpZ(x, y, z, bridge) {
    let dz = 0;
    for (const b of Object.values(bumps)) {
      if (b.amp <= 0) continue;
      if (b.side > 0 && z <= 0) continue;
      if (b.side < 0 && z >= 0) continue;
      const gy = Math.exp(-(((y - b.y) / b.sy) ** 2));
      let gx;
      if (b.x === 0) gx = Math.exp(-((x / b.sx) ** 2));
      else {
        const dl = Math.exp(-(((x - b.x) / b.sx) ** 2)), dr = Math.exp(-(((x + b.x) / b.sx) ** 2));
        gx = bridge && Math.abs(x) < b.x ? 1 : Math.max(dl, dr);
      }
      // Wirkung zur Seite hin ausblenden (nur Vorder-/Rückfläche)
      const facing = Math.min(1, Math.abs(z) / (dS(y) * 0.6));
      dz += b.side * b.amp * gx * gy * facing;
    }
    return dz;
  }

  const radiusAt = (profile, f) => {
    const s2 = makeSpline(profile.map((p) => p[0]), profile.map((p) => p[1]));
    return s2(f);
  };

  return {
    H, s, girth, bmi, mus, head, headCenterY, chinY, neckBase, neckLen, shoulderY, shoulderJY, shoulderX,
    hipJ, crotchY, kneeY, ankleY, torsoL, upperLen, foreLen, handLen, thighX, footLen,
    rows: fy.map((y, i) => ({ y, w: rows[i][1], d: rows[i][2] })), bumps, legProfiles,
    torsoW: wS, torsoD: dS, torsoPoint, radiusAt,
    torsoY: (f) => crotchY + f * torsoL,
    pivots: {
      hips: [0, hipJ, 0],
      spine: [0, crotchY + 0.37 * torsoL, 0],
      chest: [0, crotchY + 0.62 * torsoL, 0],
      neck: [0, neckBase, 0],
      head: [0, chinY + 0.02 * s, 0.005],
      shoulderL: [shoulderX, shoulderJY, -0.008 * s], shoulderR: [-shoulderX, shoulderJY, -0.008 * s],
      elbowL: [shoulderX, shoulderJY - upperLen, -0.012 * s], elbowR: [-shoulderX, shoulderJY - upperLen, -0.012 * s],
      wristL: [shoulderX, shoulderJY - upperLen - foreLen, 0], wristR: [-shoulderX, shoulderJY - upperLen - foreLen, 0],
      thighL: [thighX, hipJ, 0], thighR: [-thighX, hipJ, 0],
      kneeL: [thighX, kneeY, 0.004], kneeR: [-thighX, kneeY, 0.004],
      ankleL: [thighX, ankleY, -0.012 * s], ankleR: [-thighX, ankleY, -0.012 * s],
    },
  };
}
