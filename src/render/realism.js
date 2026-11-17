// Fotorealistische Importfiguren bearbeitbar machen.
//
// Materialien einer importierten (z. B. gescannten) GLB werden nach Namen klassifiziert.
// Haut und Haare erhalten eine detailerhaltende Farbumrechnung: Die Originaltextur wird
// durch ihre eigene Durchschnittsfarbe geteilt und mit der Zielfarbe multipliziert.
// Poren, Sommersprossen, Rötungen und Strähnen bleiben dadurch erhalten, nur der Grundton
// ändert sich. Keine Pixel werden hochgeladen; alles läuft lokal im Shader.
import * as THREE from 'three';

export const MATERIAL_CLASSES = Object.freeze({
  skin: /skin|haut|body|koerper|körper|head|face|gesicht|arm|leg|bein|hand|foot|fuss|torso|ear|ohr|lip/i,
  hair: /hair|haar|brow|braue|lash|wimper|beard|bart|scalp/i,
  eye: /eye|auge|iris|cornea|sclera|pupil/i,
  teeth: /teeth|tooth|zahn|zähne|tongue|zunge|mouth|gum/i,
});

export function classifyMaterial(name = '') {
  // Reihenfolge wichtig: „eyebrow“ ist Haar, nicht Auge
  if (MATERIAL_CLASSES.hair.test(name)) return 'hair';
  if (MATERIAL_CLASSES.eye.test(name)) return 'eye';
  if (MATERIAL_CLASSES.teeth.test(name)) return 'teeth';
  if (MATERIAL_CLASSES.skin.test(name)) return 'skin';
  return 'other';
}

/** Mittlere Farbe einer Textur (linear), per verkleinertem Canvas. */
export function averageTextureColor(texture) {
  const img = texture?.image;
  if (!img || !(img.width > 0)) return null;
  try {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      // sehr dunkle/helle Ausreißer (Augenbrauen, Lichter) ignorieren
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (l < 12 || l > 250) continue;
      r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return null;
    return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
  } catch {
    return null;
  }
}

/** Ersetzt Material durch MeshPhysicalMaterial mit Farbumrechnung (falls nötig). */
function upgrade(mat, cls) {
  const phys = mat.isMeshPhysicalMaterial ? mat : new THREE.MeshPhysicalMaterial();
  if (phys !== mat) {
    for (const k of ['name', 'map', 'normalMap', 'normalScale', 'roughnessMap', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'emissive', 'emissiveMap',
      'alphaMap', 'transparent', 'opacity', 'alphaTest', 'side', 'roughness', 'metalness', 'color', 'vertexColors', 'flatShading']) {
      if (mat[k] !== undefined) phys[k] = mat[k]?.clone && !mat[k].isTexture ? mat[k].clone() : mat[k];
    }
  }
  if (cls === 'skin') {
    // Haut: weiches Streulicht (Sheen) als Annäherung an Subsurface-Scattering
    phys.sheen = Math.max(phys.sheen || 0, 0.3);
    phys.sheenRoughness = 0.5;
    phys.sheenColor = new THREE.Color('#d9826e');
    phys.specularIntensity = 0.55;
    phys.clearcoat = Math.max(phys.clearcoat || 0, 0.06);
    phys.clearcoatRoughness = 0.5;
  } else if (cls === 'hair') {
    phys.sheen = Math.max(phys.sheen || 0, 0.5);
    phys.sheenRoughness = 0.35;
    phys.anisotropy = 0.5;
    if (phys.map && !phys.alphaTest && phys.transparent) { phys.alphaTest = 0.4; phys.transparent = false; phys.depthWrite = true; }
  } else if (cls === 'eye') {
    phys.clearcoat = 1; phys.clearcoatRoughness = 0.03;
  }
  const uniforms = {
    uTarget: { value: new THREE.Color(1, 1, 1) },
    uSource: { value: new THREE.Color(1, 1, 1) },
    uAmount: { value: 0 },
  };
  phys.userData.tone = uniforms;
  phys.userData.cls = cls;
  phys.userData.originalColor = phys.color.clone();
  phys.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTarget;\nuniform vec3 uSource;\nuniform float uAmount;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 toneShift = diffuseColor.rgb / max(uSource, vec3(0.02)) * uTarget;
        diffuseColor.rgb = mix(diffuseColor.rgb, toneShift, uAmount);`);
  };
  phys.customProgramCacheKey = () => `atelier-tone-${cls}`;
  phys.needsUpdate = true;
  return phys;
}

/**
 * Bereitet eine geladene Szene vor. Gibt eine Liste klassifizierter Materialien zurück.
 * @returns {{material: THREE.Material, cls: string, source: THREE.Color|null}[]}
 */
export function prepareRealistic(scene) {
  const seen = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material).map((m) => {
      if (seen.has(m.uuid)) return seen.get(m.uuid).material;
      const cls = classifyMaterial(`${m.name} ${o.name}`);
      const up = upgrade(m, cls);
      const source = up.map ? averageTextureColor(up.map) : null;
      if (source) up.userData.tone.uSource.value.copy(source.convertSRGBToLinear());
      seen.set(m.uuid, { material: up, cls, source });
      return up;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
  });
  return [...seen.values()];
}

/**
 * Überträgt Hautton/Haarfarbe der Figur auf die klassifizierten Materialien.
 * @param {{skin?: string, hairColor?: string}} app
 * @param {{skin?: boolean, hair?: boolean}} enabled
 */
export function applyAppearance(entries, app, enabled = { skin: true, hair: true }) {
  let n = 0;
  for (const { material, cls } of entries) {
    const tone = material.userData.tone;
    if (!tone) continue;
    const target = cls === 'skin' ? app.skin : cls === 'hair' ? app.hairColor : null;
    const on = target && enabled[cls];
    if (!on) {
      tone.uAmount.value = 0;
      material.color.copy(material.userData.originalColor);
      continue;
    }
    const tgt = new THREE.Color(target); // Hex → linear (ColorManagement)
    if (material.map) {
      tone.uTarget.value.copy(tgt);
      tone.uAmount.value = 1;
      material.color.setRGB(1, 1, 1);
    } else {
      tone.uAmount.value = 0;
      material.color.copy(tgt);
    }
    n++;
  }
  return n;
}
