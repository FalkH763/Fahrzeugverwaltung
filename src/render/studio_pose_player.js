// Quelle: FALK Studio MotionKit 01 (vom Projektinhaber bereitgestellt), unverändert übernommen.
/**
 * FALK Studio MotionKit v1 — runtime for the user's procedural Three.js figure.
 * No dependencies besides an existing fig.bones collection with Three.js Object3D nodes.
 * The pack describes JOINT OFFSETS (relative to the captured rest pose), not GLB animation clips.
 * IMPORTANT: capture the rest pose before calling the project's original applyPose().
 */
const DEG = Math.PI / 180;
const cap = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const mix = (a, b, f) => a + (b - a) * f;
const smooth = u => u * u * (3 - 2 * u);
const is3 = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);

function interpolateBone(a = {}, b = {}, f) {
  const out = {};
  for (const part of ['rot', 'pos']) {
    const av = is3(a[part]) ? a[part] : [0, 0, 0];
    const bv = is3(b[part]) ? b[part] : [0, 0, 0];
    out[part] = [0, 1, 2].map(i => mix(av[i], bv[i], f));
  }
  return out;
}
function sampledAnimation(clip, t) {
  if (!Array.isArray(clip.keyframes) || !clip.keyframes.length) {
    throw new Error(`Animation ${clip.id}: keine Keyframes`);
  }
  const duration = clip.duration;
  if (!(duration > 0)) throw new Error(`Animation ${clip.id}: duration muss > 0 sein`);
  const time = clip.loop ? ((t % duration) + duration) % duration : cap(t, 0, duration);
  const frames = clip.keyframes;
  let a = frames[0], b = frames[frames.length - 1];
  if (time <= a.t) { b = a; }
  else if (time >= b.t) { a = b; }
  else {
    for (let i = 0; i < frames.length - 1; i++) {
      if (frames[i].t <= time && time <= frames[i + 1].t) {
        a = frames[i]; b = frames[i + 1]; break;
      }
    }
  }
  const u = b.t === a.t ? 0 : smooth(cap((time - a.t) / (b.t - a.t), 0, 1));
  const bones = {};
  for (const name of new Set([...Object.keys(a.bones ?? {}), ...Object.keys(b.bones ?? {})])) {
    bones[name] = interpolateBone(a.bones?.[name], b.bones?.[name], u);
  }
  const hands = { ...(a.hands || b.hands || {}) };
  if (b.hands && u >= 0.5) Object.assign(hands, b.hands);
  return { bones, hands };
}

export class StudioPosePlayer {
  /** fig.bones must contain Three.js Groups/Bones; pack is the imported JSON. */
  constructor(fig, pack, { positionScale = 1 } = {}) {
    if (!fig?.bones || !pack || pack.schemaId !== 'falk.studio.motionpack.v1') {
      throw new Error('FALK Studio: fig.bones oder passendes JSON-MotionPack fehlt.');
    }
    this.fig = fig;
    this.pack = pack;
    this.positionScale = positionScale;
    this.poses = new Map(pack.poses.map(p => [p.id, p]));
    this.animations = new Map(pack.animations.map(a => [a.id, a]));
    this.rest = new Map();
    this.captureRest();
  }

  /** Call once, while the figure is still in its original bind/rest pose. */
  captureRest() {
    this.rest.clear();
    for (const [name, node] of Object.entries(this.fig.bones)) {
      if (!node?.rotation || !node?.position) continue;
      this.rest.set(name, { rotation: node.rotation.clone(), position: node.position.clone() });
    }
  }

  /** Safe reset: rest pose, including thumb initial orientation. */
  reset() {
    for (const [name, initial] of this.rest) {
      const node = this.fig.bones[name];
      if (!node) continue;
      node.rotation.copy(initial.rotation);
      node.position.copy(initial.position);
    }
  }

  _hand(side, style, strength) {
    const shape = this.pack.handShapes[style] ?? this.pack.handShapes.relaxed;
    const sign = side === 'L' ? 1 : -1;
    if (!shape) return;
    for (let i = 0; i < 4; i++) {
      const a = this.fig.bones[`f${side}${i}a`];
      const b = this.fig.bones[`f${side}${i}b`];
      const angle = shape.f[i] ?? 0;
      if (a) a.rotation.z += -sign * angle * 0.6 * DEG * strength;
      if (b) b.rotation.z += -sign * angle * 0.9 * DEG * strength;
    }
    const thumb = this.fig.bones[`t${side}`];
    if (thumb) thumb.rotation.z += -sign * shape.thumb * DEG * strength;
  }

  _apply(state, { strength = 1, mirror = false } = {}) {
    // Rotations are relative to the figure's own neutral/rest pose.
    // 'mirror' swaps sides and flips Y/Z rotations; usable only with symmetric rigs.
    const k = cap(Number(strength) || 0, 0, 1.5);
    this.reset();
    for (const [boneName, spec] of Object.entries(state.bones ?? {})) {
      let name = boneName;
      let rot = spec.rot, pos = spec.pos;
      if (mirror) {
        if (/L$/.test(name)) name = name.slice(0, -1) + 'R';
        else if (/R$/.test(name)) name = name.slice(0, -1) + 'L';
        if (rot) rot = [rot[0], -rot[1], -rot[2]];
        if (pos) pos = [-pos[0], pos[1], pos[2]];
      }
      const target = this.fig.bones[name];
      if (!target) continue;
      const rest = this.rest.get(name);
      if (!rest) continue;
      if (is3(rot)) {
        target.rotation.set(
          rest.rotation.x + rot[0] * DEG * k,
          rest.rotation.y + rot[1] * DEG * k,
          rest.rotation.z + rot[2] * DEG * k,
          rest.rotation.order
        );
      }
      if (is3(pos)) {
        target.position.set(
          rest.position.x + pos[0] * this.positionScale * k,
          rest.position.y + pos[1] * this.positionScale * k,
          rest.position.z + pos[2] * this.positionScale * k
        );
      }
    }
    const h = state.hands || {};
    this._hand('L', h[mirror ? 'R' : 'L'] || 'relaxed', k);
    this._hand('R', h[mirror ? 'L' : 'R'] || 'relaxed', k);
  }

  /** id: pose or animation; time in seconds. For a pose, time is ignored. */
  apply(id, timeSeconds = 0, options = {}) {
    if (this.poses.has(id)) {
      this._apply(this.poses.get(id), options);
    } else if (this.animations.has(id)) {
      this._apply(sampledAnimation(this.animations.get(id), timeSeconds), options);
    } else {
      throw new Error(`FALK Studio: unbekannte Pose/Animation '${id}'`);
    }
  }

  catalog() {
    return [
      ...this.pack.poses.map(p => ({ id: p.id, label: p.label, type: 'pose', group: p.group, requires: p.requires || [] })),
      ...this.pack.animations.map(a => ({ id: a.id, label: a.label, type: 'animation', group: a.group, requires: [] }))
    ];
  }

  missingBones(id) {
    const item = this.poses.get(id) || this.animations.get(id);
    if (!item) throw new Error(`Unbekannter Clip: ${id}`);
    const keys = item.keyframes ? item.keyframes.flatMap(f => Object.keys(f.bones ?? {})) : Object.keys(item.bones ?? {});
    return [...new Set(keys)].filter(name => !this.fig.bones[name]);
  }
}
