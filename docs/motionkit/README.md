# FALK MotionKit im Charakteratelier

* Player: `src/render/studio_pose_player.js` (aus dem MotionKit, unverändert)
* Daten: `public/motions/falk_motion_pack.json` (Schema `falk.studio.motionpack.v1`)
* Vorlagen: `rig_map_template.json`, `character_manifest_template.json`

## Eigene Bewegungen ergänzen

Neue Einträge im selben Schema in `public/motions/falk_motion_pack.json` eintragen. Die Oberfläche
(Tab „Bewegung“ → „FALK MotionKit“) zeigt sie nach dem Neuladen automatisch an, gruppiert nach `group`.

* **Pose:** `{ "id", "label", "group", "bones": { "<knochen>": { "rot": [x, y, z], "pos": [x, y, z] } }, "hands": { "L", "R" } }`
* **Animation:** `{ "id", "label", "group", "duration", "loop", "keyframes": [ { "t", "bones", "hands" } ] }`
* Winkel in Grad relativ zur Ruhepose, Verschiebungen in Metern (bei 1,70 m Figurengröße), Zeit in Sekunden.
* Knochennamen: `hips, spine, chest, neck, head, shoulderL/R, elbowL/R, wristL/R, thighL/R, kneeL/R, ankleL/R`,
  Finger `fL0a … fL3b`, `fR0a … fR3b`, Daumen `tL`, `tR`. Schulter/Ellbogen drehen in der Reihenfolge Y-X-Z.
* Handformen aus `handShapes` verwenden oder dort neue anlegen.
* `requires` (z. B. `["prop", "IK"]`) wird in der Oberfläche mit `*` markiert.

Prüfen: `npm test` validiert IDs, Knochennamen, Handformen und Keyframe-Reihenfolge.
Der Test `motionkit.test.js` zählt außerdem die Einträge der Atelier-Auswahl (30 Posen, 8 Animationen);
diese Zahlen beim Ergänzen anpassen.

## Atelier-Anpassungen gegenüber dem Original

* Nicht übernommen: Gruppe „boudoir“ sowie `twerk_bounce`, `body_wave`, `hip_circle`, `hip_eight` (16 Einträge).
* `behind_back`: Armhaltung korrigiert (Original zeigte die Arme seitlich).
* `head_tilt`: Bezeichnung „Kopf neigen“.
* Hinweis aus dem MotionKit-README zu nicht lauffähigem `studio_moves`-Code: betrifft nicht dieses Repo;
  `src/render/motion.js` hier ist bereinigt und getestet.
