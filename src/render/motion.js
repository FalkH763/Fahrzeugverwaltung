// Posen, Gesten und Tänze für die parametrische Basisfigur (alle Profile).
// Für importierte Figuren deaktiviert: kein ungeprüftes Retargeting auf fremde Skelette.

const D = Math.PI / 180;
const ease = (x) => (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, x)))) / 2;

export const MOVE_GROUPS = Object.freeze([
  { id: 'basis', label: 'Grundhaltung' },
  { id: 'pose', label: 'Posen' },
  { id: 'geste', label: 'Gesten' },
  { id: 'tanz', label: 'Tänze' },
  { id: 'test', label: 'Passformtests' },
]);

export const MOVES = Object.freeze([
  { id: 'idle', label: 'Stehen (Atmung)', group: 'basis' },
  { id: 'apose', label: 'A-Pose (statisch)', group: 'basis' },
  { id: 'contrapposto', label: 'Kontrapost', group: 'pose' },
  { id: 'handsHips', label: 'Hände in die Hüften', group: 'pose' },
  { id: 'armsCrossed', label: 'Arme verschränkt', group: 'pose' },
  { id: 'thinker', label: 'Nachdenklich', group: 'pose' },
  { id: 'handsBehind', label: 'Hände hinter dem Rücken', group: 'pose' },
  { id: 'lookSide', label: 'Blick zur Seite', group: 'pose' },
  { id: 'sit', label: 'Sitzen', group: 'pose' },
  { id: 'wave', label: 'Winken', group: 'geste' },
  { id: 'thumbsUp', label: 'Daumen hoch', group: 'geste' },
  { id: 'point', label: 'Zeigen', group: 'geste' },
  { id: 'peace', label: 'Peace-Zeichen', group: 'geste' },
  { id: 'shrug', label: 'Schulterzucken', group: 'geste' },
  { id: 'clap', label: 'Klatschen', group: 'geste' },
  { id: 'nod', label: 'Nicken', group: 'geste' },
  { id: 'groove', label: 'Hip-Hop-Groove', group: 'tanz' },
  { id: 'salsa', label: 'Salsa-Grundschritt', group: 'tanz' },
  { id: 'disco', label: 'Disco-Fingerpoint', group: 'tanz' },
  { id: 'step', label: 'Schritt seitlich', group: 'tanz' },
  { id: 'twist', label: 'Drehen', group: 'tanz' },
  { id: 'shuffle', label: 'Wippen', group: 'tanz' },
  { id: 'sequence', label: 'Tanzfolge aus dem Projekt', group: 'tanz' },
  { id: 'armsUp', label: 'Arme heben', group: 'test' },
  { id: 'knees', label: 'Knie beugen', group: 'test' },
]);

const DANCE_IDS = ['groove', 'salsa', 'disco', 'step', 'twist', 'shuffle'];

/** Handformen: Krümmung je Finger (Zeige-, Mittel-, Ring-, kleiner Finger) in Grad + Daumen. */
const HANDS = {
  relaxed: { f: [12, 16, 18, 20], thumb: 0 },
  open: { f: [0, 0, 0, 0], thumb: -10 },
  fist: { f: [85, 88, 88, 85], thumb: 35 },
  point: { f: [0, 88, 88, 85], thumb: 35 },
  thumbUp: { f: [88, 90, 90, 88], thumb: -40 },
  peace: { f: [0, 0, 88, 85], thumb: 35 },
};

function setHand(fig, side, shape) {
  const h = HANDS[shape] || HANDS.relaxed;
  const sx = side === 'L' ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    const a = fig.bones[`f${side}${i}a`], b = fig.bones[`f${side}${i}b`];
    if (!a) return;
    // Finger krümmen zur Handfläche (Innenseite = Richtung Körpermitte)
    a.rotation.set(0, 0, -sx * h.f[i] * 0.6 * D);
    b.rotation.set(0, 0, -sx * h.f[i] * 0.9 * D);
  }
  const t = fig.bones[`t${side}`];
  if (t?.userData.rest) { t.rotation.copy(t.userData.rest); t.rotation.z += -sx * h.thumb * D; }
}

/** Kurzschreibweise: Winkel in Grad je Gelenk. */
function set(fig, spec) {
  for (const [bone, v] of Object.entries(spec)) {
    const b = fig.bones[bone];
    if (!b) continue;
    if (v.x !== undefined) b.rotation.x = v.x * D;
    if (v.y !== undefined) b.rotation.y = v.y * D;
    if (v.z !== undefined) b.rotation.z = v.z * D;
  }
}

/** Setzt die Pose. t in Sekunden. */
export function applyPose(fig, motion, t) {
  const b = fig.bones;
  for (const bone of Object.values(b)) bone.rotation.set(0, 0, 0);
  b.hips.position.set(0, fig.pivotWorld.hips.y, 0);
  const m = motion.manual || {};
  const k = motion.intensity ?? 1;
  let id = motion.id || 'idle';
  const bpm = motion.bpm || 104;
  let beat = (t * bpm) / 60;

  // Tanzfolge: Abschnitte aus motion.sequence ([{id, beats}]) nacheinander
  if (id === 'sequence') {
    const seq = (motion.sequence || []).filter((s) => DANCE_IDS.includes(s.id) && s.beats > 0);
    if (seq.length) {
      const total = seq.reduce((a, s) => a + s.beats, 0);
      let pos = beat % total;
      for (const s of seq) { if (pos < s.beats) { id = s.id; beat = pos; break; } pos -= s.beats; }
    } else id = 'groove';
  }

  const breathe = id === 'apose' ? 0 : Math.sin(t * 1.6) * 0.012 * k;
  const armL = (6 + (m.armLZ ?? 6)) * D, armR = (6 + (m.armRZ ?? 6)) * D;
  b.shoulderL.rotation.z = armL; b.shoulderR.rotation.z = -armR;
  b.shoulderL.rotation.x = (m.armLX ?? 0) * D; b.shoulderR.rotation.x = (m.armRX ?? 0) * D;
  b.elbowL.rotation.x = -(m.elbowL ?? 5) * D; b.elbowR.rotation.x = -(m.elbowR ?? 5) * D;
  b.thighL.rotation.z = 1.5 * D; b.thighR.rotation.z = -1.5 * D;
  b.ankleL.rotation.z = -1.5 * D; b.ankleR.rotation.z = 1.5 * D;
  b.head.rotation.x = (m.headX ?? 0) * D; b.head.rotation.y = (m.headY ?? 0) * D;
  b.spine.rotation.x = (m.lean ?? 0) * D;
  b.chest.rotation.x = breathe * 0.4;
  setHand(fig, 'L', 'relaxed'); setHand(fig, 'R', 'relaxed');
  const sway = (amp) => { b.hips.rotation.z = Math.sin(t * 0.5) * amp * D; b.spine.rotation.z = -Math.sin(t * 0.5) * amp * 0.75 * D; };
  const A = fig.A;
  const thighLen = A.hipJ - A.kneeY;

  switch (id) {
    case 'idle':
      sway(0.8 * k);
      b.head.rotation.y += Math.sin(t * 0.31) * 4 * D * k;
      b.head.rotation.x += Math.sin(t * 0.23) * 1.5 * D * k;
      break;
    case 'apose': setHand(fig, 'L', 'open'); setHand(fig, 'R', 'open'); break;

    // ---------- Posen ----------
    case 'contrapposto':
      b.hips.position.x = 0.025; b.hips.rotation.z = 4 * D;
      set(fig, { spine: { z: -5 }, chest: { z: -2 }, head: { z: 3, y: -6 }, thighR: { z: -6, x: -6 }, kneeR: { x: 12 }, thighL: { z: 0 }, shoulderR: { z: -12 } });
      break;
    case 'handsHips':
      set(fig, { shoulderL: { z: 48, x: 0 }, elbowL: { x: 0, z: -100 }, shoulderR: { z: -48, x: 0 }, elbowR: { x: 0, z: 100 }, wristL: { z: 20 }, wristR: { z: -20 } });
      setHand(fig, 'L', 'open'); setHand(fig, 'R', 'open');
      sway(0.5);
      break;
    case 'armsCrossed':
      set(fig, { shoulderL: { x: -38, z: 14 }, elbowL: { x: -95, y: -75 }, shoulderR: { x: -32, z: -14 }, elbowR: { x: -98, y: 75 } });
      setHand(fig, 'L', 'relaxed'); setHand(fig, 'R', 'relaxed');
      break;
    case 'thinker':
      set(fig, { shoulderR: { x: -30, z: -10 }, elbowR: { x: -135, y: 35 }, wristR: { x: 20 }, shoulderL: { x: -28, z: 12 }, elbowL: { x: -90, y: -70 }, head: { x: 8, z: -6 } });
      setHand(fig, 'R', 'fist');
      break;
    case 'handsBehind':
      set(fig, { shoulderL: { x: 22, z: 10, y: -100 }, elbowL: { x: -75 }, shoulderR: { x: 22, z: -10, y: 100 }, elbowR: { x: -75 }, spine: { x: -3 } });
      break;
    case 'lookSide':
      set(fig, { head: { y: 35, x: -4 }, chest: { y: 8 }, spine: { y: 6 }, thighL: { z: 4 } });
      break;
    case 'sit': {
      const angL = (motion.angles?.kneeL ?? 90) * D, angR = (motion.angles?.kneeR ?? 90) * D;
      b.hips.position.y = A.kneeY + 0.02;
      b.thighL.rotation.x = -90 * D; b.thighR.rotation.x = -90 * D;
      b.kneeL.rotation.x = angL; b.kneeR.rotation.x = angR;
      set(fig, { shoulderL: { x: -25 }, shoulderR: { x: -25 }, elbowL: { x: -35 }, elbowR: { x: -35 } });
      break;
    }

    // ---------- Gesten ----------
    case 'wave':
      set(fig, { shoulderR: { z: -150 }, elbowR: { x: -20 }, head: { y: -8 } });
      b.elbowR.rotation.y = Math.sin(t * 7) * 0.35 * k;
      setHand(fig, 'R', 'open');
      break;
    case 'thumbsUp': {
      const up = ease(t * 1.5);
      set(fig, { shoulderR: { x: -55 * up, z: -12 }, elbowR: { x: -80 * up }, wristR: { y: -90 * up } });
      setHand(fig, 'R', 'thumbUp');
      b.head.rotation.x = 4 * D;
      break;
    }
    case 'point': {
      const up = ease(t * 1.5);
      set(fig, { shoulderR: { x: -85 * up, z: -18 * up }, elbowR: { x: -8 }, head: { y: -12 * up } });
      setHand(fig, 'R', 'point');
      break;
    }
    case 'peace': {
      const up = ease(t * 1.5);
      set(fig, { shoulderR: { x: -40 * up, z: -30 * up }, elbowR: { x: -125 * up, y: 20 }, wristR: { y: -70 * up } });
      setHand(fig, 'R', 'peace');
      b.head.rotation.z = -6 * D * up;
      break;
    }
    case 'shrug': {
      const p = Math.max(0, Math.sin(t * 2));
      set(fig, { shoulderL: { z: 30 + 10 * p, x: -10 }, elbowL: { x: -80, y: 40 * p }, shoulderR: { z: -30 - 10 * p, x: -10 }, elbowR: { x: -80, y: -40 * p }, head: { z: 8 * p, x: -4 * p } });
      setHand(fig, 'L', 'open'); setHand(fig, 'R', 'open');
      break;
    }
    case 'clap': {
      const p = Math.abs(Math.sin(beat * Math.PI));
      set(fig, { shoulderL: { x: -50, z: 8 }, elbowL: { x: -70, y: -40 - 25 * (1 - p) }, shoulderR: { x: -50, z: -8 }, elbowR: { x: -70, y: 40 + 25 * (1 - p) } });
      setHand(fig, 'L', 'open'); setHand(fig, 'R', 'open');
      break;
    }
    case 'nod':
      b.head.rotation.x = (6 + Math.sin(t * 5) * 10) * D;
      sway(0.5);
      break;

    // ---------- Tänze ----------
    case 'groove': {
      const ph = beat * Math.PI, bounce = Math.abs(Math.sin(ph));
      b.hips.position.y -= bounce * 0.035 * k;
      b.hips.position.x = Math.sin(ph / 2) * 0.03 * k;
      for (const s of ['L', 'R']) { b[`thigh${s}`].rotation.x = -bounce * 12 * D * k; b[`knee${s}`].rotation.x = bounce * 24 * D * k; b[`ankle${s}`].rotation.x = -bounce * 12 * D * k; }
      b.chest.rotation.y = Math.sin(ph / 2) * 10 * D * k;
      b.head.rotation.x = bounce * 8 * D * k;
      set(fig, { shoulderL: { x: -35 + Math.sin(ph) * 20, z: 25 }, elbowL: { x: -85 }, shoulderR: { x: -35 - Math.sin(ph) * 20, z: -25 }, elbowR: { x: -85 } });
      setHand(fig, 'L', 'fist'); setHand(fig, 'R', 'fist');
      break;
    }
    case 'salsa': {
      // 8 Zähler: vor (1-3), Pause (4), zurück (5-7), Pause (8)
      const c = beat % 8, fwd = c < 4 ? ease(Math.min(c, 1)) * (c < 3 ? 1 : 1 - ease(c - 3)) : 0;
      const back = c >= 4 ? ease(Math.min(c - 4, 1)) * (c < 7 ? 1 : 1 - ease(c - 7)) : 0;
      b.thighL.rotation.x = -fwd * 18 * D * k; b.kneeL.rotation.x = fwd * 10 * D;
      b.thighR.rotation.x = back * 16 * D * k; b.kneeR.rotation.x = back * 12 * D;
      b.hips.rotation.z = Math.sin(beat * Math.PI) * 4 * D * k;
      b.spine.rotation.z = -Math.sin(beat * Math.PI) * 3 * D * k;
      set(fig, { shoulderL: { x: -30, z: 30 }, elbowL: { x: -80 }, shoulderR: { x: -30, z: -30 }, elbowR: { x: -80 } });
      b.chest.rotation.y = Math.sin(beat * Math.PI) * 6 * D;
      break;
    }
    case 'disco': {
      const up = Math.sin(beat * Math.PI / 2) > 0;
      set(fig, up ? { shoulderR: { z: -145, x: -10 }, elbowR: { x: -5 }, shoulderL: { z: 25, x: -20 }, elbowL: { x: -90 } }
        : { shoulderR: { z: -35, x: -30 }, elbowR: { x: -5 }, shoulderL: { z: 25, x: -20 }, elbowL: { x: -90 } });
      setHand(fig, 'R', 'point'); setHand(fig, 'L', 'fist');
      b.hips.position.x = (up ? 1 : -1) * 0.03 * k;
      b.hips.rotation.z = (up ? 5 : -5) * D * k;
      b.thighL.rotation.z += up ? 6 * D : 0;
      b.head.rotation.y = (up ? -15 : 10) * D;
      break;
    }
    case 'step': {
      const ph = Math.sin(beat * Math.PI);
      b.hips.position.x = ph * 0.04 * k;
      b.thighL.rotation.z += Math.max(0, ph) * 10 * D * k;
      b.thighR.rotation.z -= Math.max(0, -ph) * 10 * D * k;
      b.spine.rotation.z = -ph * 3 * D * k;
      b.shoulderL.rotation.z += Math.max(0, ph) * 10 * D; b.shoulderR.rotation.z -= Math.max(0, -ph) * 10 * D;
      break;
    }
    case 'twist': {
      const ph = Math.sin(beat * Math.PI);
      b.spine.rotation.y = ph * 18 * D * k;
      b.hips.rotation.y = -ph * 6 * D * k;
      b.head.rotation.y = -ph * 10 * D * k;
      b.elbowL.rotation.x = -60 * D; b.elbowR.rotation.x = -60 * D;
      break;
    }
    case 'shuffle': {
      const ph = Math.abs(Math.sin(beat * Math.PI));
      b.hips.position.y -= ph * 0.03 * k;
      for (const s of ['L', 'R']) { b[`thigh${s}`].rotation.x = -ph * 14 * D * k; b[`knee${s}`].rotation.x = ph * 28 * D * k; b[`ankle${s}`].rotation.x = -ph * 14 * D * k; }
      b.elbowL.rotation.x = -(30 + ph * 40) * D; b.elbowR.rotation.x = -(30 + ph * 40) * D;
      break;
    }

    // ---------- Passformtests ----------
    case 'armsUp': {
      const ph = (1 - Math.cos(t * 1.2)) / 2;
      b.shoulderL.rotation.z = armL + ph * 140 * D; b.shoulderR.rotation.z = -armR - ph * 140 * D;
      break;
    }
    case 'knees': {
      const a = 40 * D * ((1 - Math.cos(t * 1.4)) / 2);
      const shinLen = A.kneeY - A.ankleY;
      b.hips.position.y -= thighLen * (1 - Math.cos(a)) + shinLen * (1 - Math.cos(a));
      for (const s of ['L', 'R']) { b[`thigh${s}`].rotation.x = -a; b[`knee${s}`].rotation.x = 2 * a; b[`ankle${s}`].rotation.x = -a; }
      b.spine.rotation.x = a * 0.4;
      break;
    }
    default: break;
  }
}
