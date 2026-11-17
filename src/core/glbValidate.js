// Vorprüfung importierter GLB-2.0-Dateien, bevor der GLTFLoader sie lädt.
// Externe Daten werden nie nachgeladen.

export const MAX_GLB_BYTES = 150 * 1024 * 1024; // Importgrenze, keine Leistungszusage
export const MOBILE_BUDGET = Object.freeze({ triangles: 100_000, bytes: 30 * 1024 * 1024, textureEdge: 2048 });

const MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Kompressions-/Textur-Erweiterungen, deren Decoder im lokalen Paket nicht mitgeladen werden. */
export const UNSUPPORTED_EXTENSIONS = Object.freeze({
  KHR_draco_mesh_compression: 'Draco-Kompression',
  EXT_meshopt_compression: 'Meshopt-Kompression',
  KHR_meshopt_compression: 'Meshopt-Kompression',
  KHR_texture_basisu: 'KTX2/Basis-Texturen',
});

export class GlbError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const isDataUri = (u) => typeof u === 'string' && /^data:/i.test(u);

/**
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ok: true, json: object, report: object}}  wirft GlbError bei Ablehnung
 */
export function validateGlb(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const size = bytes.byteLength;
  if (size > MAX_GLB_BYTES) throw new GlbError('too_large', `Datei ist ${(size / 1048576).toFixed(1)} MiB groß; Grenze dieses Importers: 150 MiB.`);
  if (size < 20) throw new GlbError('truncated', 'Datei ist zu klein für einen GLB-Container.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, size);
  if (dv.getUint32(0, true) !== MAGIC) {
    const head = new TextDecoder().decode(bytes.subarray(0, Math.min(64, size))).trim();
    if (head.startsWith('{')) throw new GlbError('gltf_json', 'Das ist eine .gltf-JSON-Datei. Mehrdateien-glTF bitte zuerst als eingebettete GLB exportieren.');
    if (bytes[0] === 0xff && bytes[1] === 0xd8) throw new GlbError('image', 'Das ist ein JPEG-Bild, keine 3D-Figur.');
    if (bytes[0] === 0x89 && bytes[1] === 0x50) throw new GlbError('image', 'Das ist ein PNG-Bild, keine 3D-Figur.');
    if (/^Kaydara FBX|^; FBX/.test(head)) throw new GlbError('fbx', 'FBX wird nicht direkt importiert. In Blender prüfen und als GLB exportieren.');
    if (head.startsWith('BLENDER')) throw new GlbError('blend', '.blend wird nicht direkt importiert. In Blender als GLB exportieren.');
    throw new GlbError('magic', 'Keine GLB-Datei (Kennung „glTF“ fehlt).');
  }
  const version = dv.getUint32(4, true);
  if (version !== 2) throw new GlbError('version', `GLB-Version ${version} wird nicht unterstützt; erwartet wird glTF 2.0.`);
  const declared = dv.getUint32(8, true);
  if (declared !== size) throw new GlbError('length', `Header nennt ${declared} Bytes, Datei hat ${size} Bytes (beschädigt oder abgeschnitten).`);

  let offset = 12;
  let json = null;
  let bin = null;
  let chunkIndex = 0;
  while (offset < size) {
    if (offset + 8 > size) throw new GlbError('chunk', 'Unvollständiger Chunk-Header.');
    const len = dv.getUint32(offset, true);
    const type = dv.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + len > size) throw new GlbError('chunk', 'Chunk reicht über das Dateiende hinaus.');
    if (chunkIndex === 0 && type !== CHUNK_JSON) throw new GlbError('chunk', 'Erster Chunk ist kein JSON-Chunk.');
    if (type === CHUNK_JSON) {
      try { json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + len))); }
      catch { throw new GlbError('json', 'JSON-Chunk ist kein gültiges JSON.'); }
    } else if (type === CHUNK_BIN && !bin) {
      bin = bytes.subarray(start, start + len);
    }
    offset = start + len;
    chunkIndex++;
  }
  if (!json) throw new GlbError('json', 'Kein JSON-Chunk gefunden.');
  const av = String(json.asset?.version || '');
  if (!av.startsWith('2.')) throw new GlbError('version', `asset.version „${av}“ ist nicht glTF 2.x.`);

  const required = json.extensionsRequired || [];
  const used = json.extensionsUsed || [];
  for (const ext of new Set([...required, ...used])) {
    if (UNSUPPORTED_EXTENSIONS[ext]) {
      throw new GlbError('compression', `${UNSUPPORTED_EXTENSIONS[ext]} (${ext}) wird im lokalen Paket nicht dekodiert. Bitte ohne Draco/Meshopt/KTX2 exportieren.`);
    }
  }

  // Externe Verweise ablehnen (keine Nachladeversuche)
  (json.buffers || []).forEach((b, i) => {
    if (b.uri !== undefined && !isDataUri(b.uri)) throw new GlbError('external', `Buffer ${i} verweist auf externe Datei „${b.uri}“. Bitte alle Daten einbetten.`);
    if (b.uri === undefined && i === 0 && !bin && b.byteLength > 0) throw new GlbError('bin_missing', 'Buffer 0 erwartet einen BIN-Chunk, der fehlt.');
  });
  (json.images || []).forEach((im, i) => {
    if (im.uri !== undefined && !isDataUri(im.uri)) throw new GlbError('external', `Bild ${i} verweist auf externe Datei „${im.uri}“. Texturen bitte einbetten.`);
  });

  const report = buildReport(json, bin, size);
  return { ok: true, json, report };
}

function buildReport(json, bin, size) {
  const accessors = json.accessors || [];
  let triangles = 0;
  let morphTargets = 0;
  let vertices = 0;
  for (const m of json.meshes || []) {
    for (const prim of m.primitives || []) {
      const mode = prim.mode ?? 4;
      const pos = accessors[prim.attributes?.POSITION];
      if (pos) vertices += pos.count;
      const count = prim.indices !== undefined ? accessors[prim.indices]?.count ?? 0 : pos?.count ?? 0;
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
      morphTargets = Math.max(morphTargets, (prim.targets || []).length);
    }
  }
  const joints = new Set();
  for (const s of json.skins || []) for (const j of s.joints || []) joints.add(j);
  const images = (json.images || []).map((im, i) => {
    const info = { index: i, name: im.name || `Bild ${i}`, mimeType: im.mimeType || null, width: null, height: null };
    if (bin && im.bufferView !== undefined) {
      const bv = json.bufferViews?.[im.bufferView];
      if (bv && (bv.buffer ?? 0) === 0) {
        const dims = imageSize(bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
        if (dims) Object.assign(info, dims);
      }
    }
    return info;
  });
  const clips = (json.animations || []).map((a, i) => a.name || `Clip ${i + 1}`);
  const warnings = [];
  if (triangles > MOBILE_BUDGET.triangles) warnings.push(`${triangles.toLocaleString('de-DE')} Dreiecke – mobiles Startbudget ca. 50.000–100.000.`);
  if (size > MOBILE_BUDGET.bytes) warnings.push(`${(size / 1048576).toFixed(1)} MiB – mobiles Startbudget unter 30 MiB.`);
  const big = images.filter((im) => im.width && Math.max(im.width, im.height) > MOBILE_BUDGET.textureEdge);
  if (big.length) warnings.push(`${big.length} Textur(en) größer als 2K.`);
  if (!(json.skins || []).length) warnings.push('Kein Rig (Skin) – Figur bleibt statisch.');
  if (morphTargets) warnings.push(`${morphTargets} Morph Targets vorhanden; sie werden nicht automatisch an die Körperregler gebunden.`);
  return {
    generator: json.asset?.generator || null,
    sizeBytes: size,
    meshes: (json.meshes || []).length,
    nodes: (json.nodes || []).length,
    skins: (json.skins || []).length,
    joints: joints.size,
    materials: (json.materials || []).map((m, i) => m.name || `Material ${i}`),
    images,
    clips,
    triangles,
    vertices,
    morphTargets,
    extensionsUsed: json.extensionsUsed || [],
    warnings,
  };
}

/** Liest Breite/Höhe aus PNG- oder JPEG-Kopfdaten. */
export function imageSize(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
  }
  return null;
}

export async function sha256Hex(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
