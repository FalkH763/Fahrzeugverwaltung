// Prozedurale Studio-Moves für die Basisfigur. Für importierte Figuren deaktiviert
// (kein ungeprüftes Retargeting auf fremde Skelette).

const D = Math.PI / 180;

export const MOVES = Object.freeze([
  { id: 'idle', label: 'Stehen (Atmung)' },
  { id: 'apose', label: 'A-Pose (statisch)' },
  { id: 'wave', label: 'Winken' },
  { id: 'step', label: 'Schritt seitlich' },
  { id: 'twist', label: 'Drehen' },
  { id: 'shuffle', label: 'Wippen' },
  { id: 'armsUp', label: 'Arme heben (Passformtest)' },
  { id: 'knees', label: 'Knie beugen (Passformtest)' },
  { id: 'sit', label: 'Sitzen' },
]);

/** Setzt die Pose. t in Sekunden. */
export function applyPose(fig, motion, t) {
  const b = fig.bones;
  for (const bone of Object.values(b)) bone.rotation.set(0, 0, 0);
  b.hips.position.y = fig.pivotWorld.hips.y;
  const m = motion.manual || {};
  const k = motion.intensity ?? 1;
  const id = motion.id || 'idle';
  const bpm = motion.bpm || 104;
  const beat = (t * bpm) / 60;
  const breathe = id === 'apose' ? 0 : Math.sin(t * 1.6) * 0.012 * k;

  // Grundhaltung: A-Pose aus manuellen Winkeln
  const armL = (6 + (m.armLZ ?? 6)) * D, armR = (6 + (m.armRZ ?? 6)) * D;
  b.shoulderL.rotation.z = armL; b.shoulderR.rotation.z = -armR;
  b.shoulderL.rotation.x = (m.armLX ?? 0) * D; b.shoulderR.rotation.x = (m.armRX ?? 0) * D;
  b.elbowL.rotation.x = -(m.elbowL ?? 5) * D; b.elbowR.rotation.x = -(m.elbowR ?? 5) * D;
  b.thighL.rotation.z = 1.5 * D; b.thighR.rotation.z = -1.5 * D;
  b.ankleL.rotation.z = -1.5 * D; b.ankleR.rotation.z = 1.5 * D;
  b.head.rotation.x = (m.headX ?? 0) * D; b.head.rotation.y = (m.headY ?? 0) * D;
  b.spine.rotation.x = (m.lean ?? 0) * D;
  b.chest.rotation.x = breathe * 0.4;

  switch (id) {
    case 'idle':
      b.hips.rotation.z = Math.sin(t * 0.5) * 0.8 * D * k;
      b.spine.rotation.z = -Math.sin(t * 0.5) * 0.6 * D * k;
      b.head.rotation.y += Math.sin(t * 0.31) * 4 * D * k;
      b.head.rotation.x += Math.sin(t * 0.23) * 1.5 * D * k;
      break;
    case 'wave': {
      b.shoulderR.rotation.z = -(150 * D) * k;
      b.elbowR.rotation.z = 0; b.elbowR.rotation.x = -20 * D;
      b.elbowR.rotation.y = Math.sin(t * 7) * 0.35 * k;
      b.head.rotation.y = -8 * D;
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
    case 'armsUp': {
      const ph = (1 - Math.cos(t * 1.2)) / 2;
      b.shoulderL.rotation.z = armL + ph * 140 * D; b.shoulderR.rotation.z = -armR - ph * 140 * D;
      break;
    }
    case 'knees': {
      const ph = (1 - Math.cos(t * 1.4)) / 2;
      const a = 40 * D * ph;
      const A = fig.A;
      const thighLen = A.hipJ - A.kneeY, shinLen = A.kneeY - A.ankleY;
      b.hips.position.y -= thighLen * (1 - Math.cos(a)) + shinLen * (1 - Math.cos(a));
      for (const s of ['L', 'R']) { b[`thigh${s}`].rotation.x = -a; b[`knee${s}`].rotation.x = 2 * a; b[`ankle${s}`].rotation.x = -a; }
      b.spine.rotation.x = a * 0.4;
      break;
    }
    case 'sit': {
      const A = fig.A;
      const angL = (motion.angles?.kneeL ?? 90) * D, angR = (motion.angles?.kneeR ?? 90) * D;
      b.hips.position.y = A.kneeY + 0.02;
      b.thighL.rotation.x = -90 * D; b.thighR.rotation.x = -90 * D;
      b.kneeL.rotation.x = angL; b.kneeR.rotation.x = angR;
      b.shoulderL.rotation.x = -25 * D; b.shoulderR.rotation.x = -25 * D;
      b.elbowL.rotation.x = -35 * D; b.elbowR.rotation.x = -35 * D;
      break;
    }
    default: break;
  }
}
