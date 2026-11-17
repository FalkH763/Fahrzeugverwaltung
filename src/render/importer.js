// Laden geprüfter GLB-Dateien mit dem GLTFLoader (ohne Draco/Meshopt/KTX2-Decoder).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { validateGlb } from '../core/glbValidate.js';

/**
 * @param {ArrayBuffer} buffer
 * @param {number} targetHeightM sichtbare Zielhöhe
 * @returns {Promise<{scene: THREE.Object3D, clips: THREE.AnimationClip[], report: object, materials: THREE.Material[]}>}
 */
export async function loadGlb(buffer, targetHeightM) {
  const { report } = validateGlb(buffer);
  const loader = new GLTFLoader();
  // Keine externen Ressourcen: ein leerer Pfad + Abfangen jeder URL-Anfrage
  loader.manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    throw new Error(`Externe Ressource blockiert: ${url}`);
  });
  const gltf = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
  const scene = gltf.scene;
  const materials = new Map();
  let meshes = 0, joints = new Set();
  scene.traverse((o) => {
    if (o.isMesh) {
      meshes++;
      o.castShadow = true; o.receiveShadow = true;
      for (const m of [].concat(o.material)) materials.set(m.uuid, m);
      if (o.isSkinnedMesh) for (const b of o.skeleton.bones) joints.add(b.uuid);
    }
  });
  normalize(scene, targetHeightM);
  return {
    scene,
    clips: gltf.animations || [],
    materials: [...materials.values()],
    report: { ...report, loadedMeshes: meshes, loadedJoints: joints.size },
  };
}

/** Zentriert das Modell auf den Boden und normalisiert die sichtbare Höhe. */
export function normalize(obj, targetHeightM) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  if (size.y <= 0) return 1;
  const k = targetHeightM / size.y;
  obj.scale.multiplyScalar(k);
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
  return k;
}
