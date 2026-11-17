# Eigene Figuren importieren

## Welches Format?

|Format                        |Verwendung                                                                                     |
|------------------------------|-----------------------------------------------------------------------------------------------|
|`.glb`, glTF 2.0              |Direktimport. Geometrie, Texturen, Rig und Clips möglichst vollständig einbetten.              |
|`.gltf` mit `.bin` und Bildern|Kein Mehrdateienimport. Zuerst als eingebettete GLB exportieren.                               |
|`.fbx`                        |In Blender prüfen und als GLB exportieren.                                                     |
|`.blend`                      |In Blender als GLB exportieren; kein direkter Browserimport.                                   |
|`.obj`                        |Statische Geometrie; nach Konvertierung anschaubar. Für Bewegung zusätzlich ein Rig nötig.     |
|`.vrm`                        |Kein VRM-Importer. Humanoid-Zuordnung, Spring Bones und VRM-Materialien nicht automatisch.     |

Ein Foto (PNG/JPG) ist keine 3D-Figur. Der Importer erkennt Bilder, `.gltf`-JSON, FBX und .blend
und nennt jeweils den richtigen Weg.

## Anforderungen an die GLB

* glTF 2.0, `.glb`, maximal 150 MiB (Importgrenze, keine Leistungszusage).
* Texturen eingebettet (PNG/JPEG oder data-URI). Externe URLs/fehlende Begleitdateien werden abgelehnt.
* Ohne Draco, Meshopt oder KTX2. Diese Decoder sind nicht mitgeladen.
* Maßstab in Metern, Y nach oben. Der Viewer zentriert das Modell und normalisiert die Höhe auf die
  eingestellte Figurengröße.
* Für Bewegung: Rig mit zur Bindepose passenden Gewichten; eigene Clips mitexportieren.
* Mobile Startbudgets: ca. 50.000–100.000 Dreiecke, überwiegend 2K-Texturen, unter 30 MiB. Der
  Bericht warnt bei Überschreitung.
* Morph Targets werden geladen und gezählt, aber noch nicht an Regler gebunden.
* Materialien sprechend benennen (`Skin…`, `Hair…`, `Eye…`), damit Hautton/Haarfarbe im Editor
  angewendet werden können.

## Nach dem Import

Ansicht, Kamera, Größenanpassung, Materialien (Farbe/Rauheit je Material), Hautton- und
Haarfarb-Umrechnung sowie eingebettete Clips („Import: …“) stehen zur Verfügung. Studio-Moves,
Sitzwinkel und Eigenaktivität sind für fremde Skelette deaktiviert; es gibt kein automatisches
Retargeting. Die vier Kleidungsstücke der Basisfigur werden nicht auf fremde Körper übertragen,
und der Blender-Stoffauftrag ist für Importfiguren deaktiviert.

## Lokale Speicherung

Die GLB wird per SHA-256 referenziert und in IndexedDB (Datenbank `charakteratelier`) unter dem
Browser-Ursprung gespeichert. Das Projekt-JSON enthält nur die Referenz. Für einen anderen Rechner,
Browser oder Server-Ursprung die GLB mitnehmen und neu importieren. Website-Daten löschen entfernt
lokal gespeicherte Modelle, deshalb Originaldatei und Projekt-JSON gemeinsam sichern.
„Basisfigur wählen“ stellt die Basisfigur wieder her, ohne die Datei zu löschen.

## Export aus Blender

1. Figur, Rig und Animationen prüfen; saubere A- oder T-Bindepose behalten.
2. Datei → Exportieren → glTF 2.0, Format **glTF Binary (.glb)**.
3. Meshes und Armature aufnehmen; Materialien und Texturen mitexportieren.
4. Bei Bedarf Animationen/Actions exportieren und Zuordnung prüfen.
5. Kompression deaktiviert lassen; die GLB erneut öffnen und Material, Maßstab, Gewichte, Clips prüfen.
6. Im Atelier: Zielprofil wählen → „Eigene Figur“ → „GLB importieren“.
