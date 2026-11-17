// Export eines Blender-Stoffauftrags (JSON) für produktion/configure_cloth.py.

import { getGarment } from './garments.js';
import { toBlenderCloth, validateFabric } from './fabrics.js';
import { fabricState } from './project.js';

export const CLOTH_JOB_FORMAT = 'atelier-cloth-job';
export const CLOTH_JOB_VERSION = 1;

/**
 * @param {object} profile  Charakterprofil
 * @param {string} garmentId
 * @param {{areaM2:number, vertexCount:number}} [previewMesh] Kennzahlen des Browser-Meshes (nur Vorschau)
 */
export function buildClothJob(profile, garmentId, previewMesh = null) {
  if (profile.customFigure) {
    throw new Error('Für importierte Figuren ist der Stoffauftrag deaktiviert: ihre Kleidung ist nicht an die vier Basis-Meshes gebunden.');
  }
  const g = getGarment(garmentId);
  if (!g) throw new Error(`Unbekanntes Kleidungsstück: ${garmentId}`);
  const fabric = fabricState(profile, garmentId);
  const errors = validateFabric(fabric);
  if (errors.length) throw new Error(`Stoffwerte ungültig: ${errors.join(' ')}`);
  const short = profile.id.replace(/^atelier-/, '');
  return {
    format: CLOTH_JOB_FORMAT,
    version: CLOTH_JOB_VERSION,
    createdAt: new Date().toISOString(),
    character: { id: profile.id, name: profile.name, master: `masters/${short}/${short}_master.blend` },
    garment: { id: g.id, label: g.label, slot: g.slot, object: g.blenderObject, pin: g.pin, note: g.simulation },
    fabric: {
      preset: fabric.preset,
      gsm: fabric.gsm,
      thicknessMm: fabric.thicknessMm,
      stretchPct: fabric.stretchPct,
      bending: fabric.bending,
      damping: fabric.damping,
      friction: fabric.friction,
      roughness: fabric.roughness,
    },
    simulation: {
      pose: 'stand',
      initialOffsetM: 0.003,
      frames: 15,
      // Die Masse je Vertex berechnet das Skript aus der echten Meshfläche im Master neu.
      massFromRealMeshArea: true,
    },
    preview: previewMesh ? { mesh: previewMesh, blender: toBlenderCloth(fabric, previewMesh) } : null,
    disclaimer: 'Entwurfsparameter, keine gemessenen Textildaten. Statischer Drapierungs-/Kollisionstest, keine Passformfreigabe.',
  };
}

export function clothJobFilename(profile, garmentId) {
  const g = getGarment(garmentId);
  const safe = (s) => s.normalize('NFKD').replace(/[^\w-]+/g, '');
  return `Stoffsimulation_${safe(g.label)}_${safe(profile.name)}.json`;
}
