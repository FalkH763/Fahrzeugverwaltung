"""Blender-Stoffauftrag des Charakterateliers ausführen (statischer Drapierungs-/Kollisionstest).

Aufruf (Blender 4.x):
    blender -b -t 4 -P configure_cloth.py -- \
        --master "masters/clara/clara_master.blend" \
        --job "Stoffsimulation_TShirt_Beispiel.json" \
        --out "stoffausgabe" --simulate --frames 15 --render-preview

Ablauf:
  * öffnet den Charakter-Master (wird NICHT verändert; Ausgabe ist eine separate .blend),
  * friert den sichtbaren Körper in der aktuellen Standpose als Kollisionsfläche ein,
  * erzeugt eine eigene Stoffkopie des Kleidungsmeshes in Weltkoordinaten,
  * berechnet Masse je Vertex aus echter Meshfläche × Flächengewicht (massenerhaltend),
  * richtet Pin-Gruppe (oberer Rand / Bund), Kollision, Selbstkollision, Dicke und Glättung ein,
  * wertet optional den Solver über N Frames aus und rendert eine Vorschau.

Die Werte sind Entwurfsparameter, keine gemessenen Textildaten. Ein numerisch endlicher
Lauf ist keine visuelle Passformfreigabe. Animierte Körperkollisionen, dauerhaft gebackene
Caches und die Rückübernahme in den Browser sind nicht enthalten.
"""

import argparse
import json
import math
import os
import sys

try:
    import bpy
    import bmesh
    from mathutils import Vector
except ImportError:  # außerhalb von Blender nur die reinen Hilfsfunktionen nutzbar
    bpy = None

JOB_FORMAT = "atelier-cloth-job"


# ---------------------------------------------------------------- reine Umrechnungen
def clamp(v, a, b):
    return max(a, min(b, v))


def blender_params(fabric, area_m2, vertex_count):
    """Gleiche Abbildung wie src/core/fabrics.js (toBlenderCloth)."""
    if area_m2 <= 0 or vertex_count < 1:
        raise ValueError("Meshfläche und Vertexanzahl müssen positiv sein")
    total_kg = area_m2 * fabric["gsm"] / 1000.0
    tension = clamp(400.0 / (fabric["stretchPct"] + 2.0), 4.0, 80.0)
    damping = fabric["damping"] / 100.0 * 50.0
    thickness_m = fabric["thicknessMm"] / 1000.0
    return {
        "total_mass_kg": total_kg,
        "mass": total_kg / vertex_count,
        "tension_stiffness": tension,
        "compression_stiffness": tension,
        "shear_stiffness": tension * 0.5,
        "bending_stiffness": 0.05 * 10 ** (fabric["bending"] / 25.0),
        "tension_damping": damping,
        "compression_damping": damping,
        "shear_damping": damping,
        "bending_damping": damping * 0.1,
        "distance_min": max(0.003, thickness_m * 1.5),
        "self_distance_min": max(0.0015, thickness_m),
        "friction": fabric["friction"] * 20.0,
        "thickness": thickness_m,
    }


def load_job(path):
    with open(path, "r", encoding="utf-8") as f:
        job = json.load(f)
    if job.get("format") != JOB_FORMAT:
        raise ValueError(f"{path}: kein {JOB_FORMAT}-Auftrag")
    for key in ("gsm", "thicknessMm", "stretchPct", "bending", "damping", "friction"):
        v = job["fabric"].get(key)
        if not isinstance(v, (int, float)) or not math.isfinite(v):
            raise ValueError(f"Stoffwert {key} fehlt oder ist ungültig")
    return job


# ---------------------------------------------------------------- Blender-Teil
def parse_args(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    ap = argparse.ArgumentParser(description="Stoffauftrag des Charakterateliers")
    ap.add_argument("--master", required=True)
    ap.add_argument("--job", required=True)
    ap.add_argument("--out", default="stoffausgabe")
    ap.add_argument("--simulate", action="store_true")
    ap.add_argument("--frames", type=int, default=None)
    ap.add_argument("--render-preview", action="store_true")
    ap.add_argument("--body", default=None, help="Name des Körperobjekts (Standard: automatisch)")
    return ap.parse_args(argv)


def mesh_area_world(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    area = sum(f.calc_area() for f in bm.faces)
    bm.free()
    return area


def find_garment(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        cands = [o for o in bpy.data.objects if o.type == "MESH" and name.lower().replace("garment_", "") in o.name.lower()]
        obj = cands[0] if cands else None
    if obj is None:
        raise RuntimeError(f"Kleidungsobjekt „{name}“ nicht im Master gefunden")
    return obj


def find_body(explicit):
    if explicit:
        return bpy.data.objects[explicit]
    for o in bpy.data.objects:
        if o.type == "MESH" and any(k in o.name.lower() for k in ("body", "koerper", "körper")) and not o.name.startswith("Garment"):
            return o
    raise RuntimeError("Körperobjekt nicht gefunden – bitte --body angeben")


def frozen_copy(obj, name):
    """Kopie mit angewandten Modifikatoren/Armature-Pose in Weltkoordinaten."""
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
    mesh.transform(obj.matrix_world)
    new = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(new)
    return new


def pin_group(obj, mode, band=0.025):
    """Automatische Pin-Gruppe: oberster Rand (Hals/Schulter) bzw. Bund. Je Schnitt prüfen!"""
    zs = [v.co.z for v in obj.data.vertices]
    top = max(zs)
    vg = obj.vertex_groups.new(name="Atelier_Pin")
    sel = [v.index for v in obj.data.vertices if v.co.z >= top - band]
    vg.add(sel, 1.0, "REPLACE")
    return vg, len(sel)


def offset_from_body(cloth, body, gap):
    """Startabstand: Stoffvertices, die näher als gap am Körper liegen, entlang der Normale verschieben."""
    moved = 0
    inv = body.matrix_world.inverted()
    for v in cloth.data.vertices:
        ok, loc, nrm, _ = body.closest_point_on_mesh(inv @ v.co)
        if not ok:
            continue
        w_loc = body.matrix_world @ loc
        d = (v.co - w_loc)
        n = (body.matrix_world.to_3x3() @ nrm).normalized()
        dist = d.dot(n)
        if dist < gap:
            v.co = w_loc + n * gap
            moved += 1
    return moved


def main():
    args = parse_args(sys.argv)
    job = load_job(args.job)
    os.makedirs(args.out, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=args.master)
    scene = bpy.context.scene
    frames = args.frames or job["simulation"].get("frames", 15)

    garment = find_garment(job["garment"]["object"])
    body = find_body(args.body)

    collider = frozen_copy(body, "Atelier_Kollision_Koerper")
    cloth = frozen_copy(garment, f"Atelier_Stoff_{job['garment']['id']}")
    for o in (body, garment):
        o.hide_render = True
        o.hide_viewport = True

    gap = job["simulation"].get("initialOffsetM", 0.003)
    moved = offset_from_body(cloth, collider, gap)
    area = mesh_area_world(cloth)
    nverts = len(cloth.data.vertices)
    p = blender_params(job["fabric"], area, nverts)

    vg, npin = pin_group(cloth, job["garment"].get("pin", "neck_shoulder"))

    sol = cloth.modifiers.new("Atelier_Dicke", "SOLIDIFY")
    sol.thickness = p["thickness"]
    sol.offset = 1.0
    cm = cloth.modifiers.new("Atelier_Stoff", "CLOTH")
    s = cm.settings
    s.quality = 8
    s.mass = p["mass"]
    s.air_damping = 1.0
    s.tension_stiffness = p["tension_stiffness"]
    s.compression_stiffness = p["compression_stiffness"]
    s.shear_stiffness = p["shear_stiffness"]
    s.bending_stiffness = p["bending_stiffness"]
    s.tension_damping = p["tension_damping"]
    s.compression_damping = p["compression_damping"]
    s.shear_damping = p["shear_damping"]
    s.bending_damping = p["bending_damping"]
    s.vertex_group_mass = vg.name
    c = cm.collision_settings
    c.distance_min = p["distance_min"]
    c.use_self_collision = True
    c.self_distance_min = p["self_distance_min"]
    c.collision_quality = 4
    # Solidify nach dem Stoff auswerten
    bpy.context.view_layer.objects.active = cloth
    while cloth.modifiers.find("Atelier_Dicke") < cloth.modifiers.find("Atelier_Stoff"):
        bpy.ops.object.modifier_move_down(modifier="Atelier_Dicke")
    cloth.modifiers.new("Atelier_Glaettung", "SUBSURF").levels = 1

    col = collider.modifiers.new("Atelier_Kollision", "COLLISION")
    collider.collision.thickness_outer = 0.002
    collider.collision.cloth_friction = p["friction"]

    cm.point_cache.frame_start = 1
    cm.point_cache.frame_end = frames
    scene.frame_start, scene.frame_end = 1, frames

    report = {
        "job": os.path.basename(args.job), "master": args.master, "garment": job["garment"],
        "fabric": job["fabric"], "mesh": {"area_m2": area, "vertices": nverts, "moved_for_offset": moved, "pinned": npin},
        "blender": p, "frames": frames, "simulated": False, "finite": None,
        "note": "Statischer Kurzlauf ohne gebackenen Disk-Cache; keine Passformfreigabe.",
    }

    if args.simulate:
        finite = True
        for f in range(1, frames + 1):
            scene.frame_set(f)
        deps = bpy.context.evaluated_depsgraph_get()
        ev = cloth.evaluated_get(deps)
        for v in ev.data.vertices:
            if not all(math.isfinite(x) for x in v.co):
                finite = False
                break
        report["simulated"] = True
        report["finite"] = finite
        zs = [v.co.z for v in ev.data.vertices]
        report["result_bbox_z"] = [min(zs), max(zs)]

    blend_out = os.path.join(args.out, f"stoff_{job['garment']['id']}_{job['character']['id']}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend_out), copy=True)
    report["output_blend"] = blend_out

    if args.render_preview:
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
        scene.render.resolution_x, scene.render.resolution_y = 900, 1200
        png = os.path.join(args.out, f"vorschau_{job['garment']['id']}.png")
        scene.render.filepath = os.path.abspath(png)
        bpy.ops.render.render(write_still=True)
        report["preview"] = png

    with open(os.path.join(args.out, f"bericht_{job['garment']['id']}.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
    print(json.dumps({"ok": True, "finite": report["finite"], "out": args.out}, ensure_ascii=False))


if __name__ == "__main__" and bpy is not None:
    main()
