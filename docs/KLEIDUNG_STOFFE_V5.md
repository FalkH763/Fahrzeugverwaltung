# Kleidung, Stoffeigenschaften und eigene Figuren – V5

## Was umgesetzt ist

Der Viewer hat eine eigene Stoffbearbeitung für jedes der vier Kleidungsmodelle. Zwölf
Stoffvorlagen sowie Flächengewicht, Dicke, Dehnung, Biegesteifigkeit, Dämpfung, Reibung und
Oberflächenrauheit sind je Figur und Kleidungsstück speicherbar. Gespeichert werden nur die
Abweichungen von der Vorlage. Die Oberflächenrauheit wirkt in der WebGL-Ansicht, die Dicke auf den
Körperabstand des Browser-Meshes. Die mechanischen Werte gehen in einen separaten
Blender-Stoffauftrag.

Eine Bibliothek weiterer fertig angepasster Kleidungsmodelle ist nicht enthalten. Stoffvorlagen
sind keine zusätzlichen Schnitte. Eine Echtzeit-Stoffsimulation im Browser gibt es noch nicht; die
Kleidung wird aus der Körperform abgeleitet und hängt an den Gelenken der Figur.

> Hinweis zu dieser Codebasis: Der V23-Quellcode und die originalen GLB-/Blender-Master standen
> beim Aufbau nicht zur Verfügung (ZIP über 10 MB, über den Drive-Connector nicht ladbar). Die vier
> Kleidungsmodelle sind hier deshalb parametrisch erzeugt und passen sich jeder Körperform an. Der
> Blender-Auftrag adressiert die Objektnamen `Garment_Sweater`, `Garment_TShirt`,
> `Garment_WoolTrousers` und `Garment_Cargo` im Master; abweichende Namen findet das Skript über
> Teilübereinstimmung.

## Vorhandene Kleidungsmodelle

|Kleidungsstück|Slot     |Standardstoff|Simulationsansatz                                                               |
|--------------|---------|-------------|--------------------------------------------------------------------------------|
|Strickpullover|Oberteil |Wollstrick   |Oberen Rand-/Schulterbereich fixieren; Ärmel, Achsel und Saum prüfen            |
|T-Shirt       |Oberteil |Jersey       |Oberen Rand fixieren; ausreichend Körperabstand und Armlochfreiheit             |
|Wollhose      |Unterteil|Wollgewebe   |Bund fixieren; Knie, Hüfte und Sitzfalten prüfen; Stoffvorlage bei Bedarf ändern|
|Cargohose     |Unterteil|Baumwolle    |Bund fixieren; Taschen, Schrittraum und Knie prüfen                             |

Ältere Kleidungs-IDs werden beim Import zugeordnet, z. B. `hoodie` → Strickpullover,
`jeans`/`straight` → Wollhose. Die Original-ID bleibt im Export erhalten, damit ältere Viewer
das Projekt weiter lesen können.

## Zwölf Stoffvorlagen

Alle Zahlen sind bearbeitbare technische Startwerte, keine gemessenen Datenblätter. Die Dehnung
wird als vereinfachter Gesamtwert verarbeitet. Kett-/Schussrichtung, Hysterese und Feuchte sind
nicht getrennt umgesetzt.

|Vorlage         |g/m²|Dicke mm|Dehnung %|Rauheit|Biegung|Dämpfung|Reibung|Struktur (Browser)|
|----------------|---:|-------:|--------:|------:|------:|-------:|------:|------------------|
|Baumwolle       |180 |0,6     |8        |0,85   |35     |25      |0,45   |Leinwand          |
|Jersey          |190 |0,7     |35       |0,82   |18     |20      |0,40   |Jersey            |
|Leinen          |170 |0,6     |4        |0,95   |45     |30      |0,50   |Leinwand          |
|Denim           |380 |1,1     |5        |0,90   |70     |35      |0,55   |Köper             |
|Wollstrick      |330 |2,5     |25       |0,95   |30     |40      |0,60   |Masche            |
|Wollgewebe      |260 |0,9     |6        |0,80   |50     |30      |0,50   |Köper             |
|Fleece          |280 |2,2     |18       |1,00   |28     |45      |0,65   |Flor              |
|Satin           |110 |0,3     |5        |0,30   |8      |12      |0,20   |Satin             |
|Viskose         |150 |0,45    |10       |0,60   |10     |15      |0,30   |Leinwand          |
|Softshell       |300 |1,5     |15       |0,65   |55     |35      |0,45   |Leinwand          |
|Polyamid-Elastan|200 |0,6     |60       |0,42   |12     |18      |0,35   |Jersey            |
|Leder           |650 |1,2     |3        |0,52   |85     |40      |0,60   |Narben            |

Eine Vorlage ändert Rauheit, Glanz (Sheen) und die prozedurale Struktur-Normalmap. Sie erzeugt
keinen neuen Schnitt. Für Nahaufnahmen braucht jeder Stoff eigene Detailtexturen.

## Bedeutung der Eigenschaften und Umrechnung

| Eigenschaft | Browser | Blender (Tuningwert, keine SI-Angabe) |
|---|---|---|
| Flächengewicht | – | Gesamtmasse = echte Meshfläche × g/m² / 1000; Masse je Vertex = Gesamtmasse / Vertexanzahl (massenerhaltend) |
| Dicke | Körperabstand des Kleidungsmeshes | Solidify-Dicke; Kollisionsabstand = max(3 mm, 1,5 × Dicke) |
| Dehnung | – | Zug-/Drucksteifigkeit = clamp(400 / (Dehnung + 2), 4, 80); Scherung = halber Wert |
| Biegesteifigkeit 0–100 | – | 0,05 · 10^(Wert/25) → 0,05 … 500 |
| Dämpfung 0–100 | – | Wert/100 · 50 |
| Reibung 0–1 | – | Kollisionsreibung = Wert · 20 |
| Rauheit 0–1 | Materialrauheit | – |

Browser (`src/core/fabrics.js`) und Skript (`produktion/configure_cloth.py`) verwenden dieselbe
Abbildung. Ein Test prüft das für alle zwölf Vorlagen.

## Lokaler Blender-Stoffworkflow

1. Im Atelier unter „Kleidung & Stoff“ eines der vier Stücke wählen.
2. Stoffvorlage und individuelle Werte einstellen; sie werden mit dem Charakterprofil gespeichert.
3. „Blender-Stoffauftrag speichern“ erzeugt ein JSON. Für importierte Figuren ist der Auftrag
   deaktiviert.
4. Im Ordner `produktion` mit installiertem Blender 4.x:

```bash
blender -b -t 4 -P configure_cloth.py -- --master "masters/clara/clara_master.blend" \
  --job "Stoffsimulation_TShirt_Beispiel.json" --out "stoffausgabe" --simulate --frames 15 --render-preview
```

Das Skript öffnet den Master und speichert eine **separate** .blend; der Master bleibt unverändert.
Es friert den sichtbaren Körper in der aktuellen Pose als Kollisionsfläche ein, erzeugt eine
Stoffkopie in Weltkoordinaten, schiebt Vertices auf 3 mm Startabstand, legt eine automatische
Pin-Gruppe am oberen Rand an (`Atelier_Pin`, je Schnitt prüfen!) und richtet Kollision,
Selbstkollision, Dicke und Glättung ein. Ausgabe: .blend, `bericht_<stück>.json` (inkl. Prüfung
auf endliche Koordinaten) und optional ein Vorschaubild.

**Prüfstand dieses Skripts:** In dieser Umgebung war kein Blender installiert. Getestet sind die
reinen Umrechnungs- und Einlesefunktionen (Python-Paritätstest). Der Blender-Teil ist
geschrieben, aber noch nicht in Blender ausgeführt worden. Er ist ein statischer Kurzlauf ohne
gebackenen Disk-Cache und keine Passformfreigabe.

## Ausbau der Garderobe nach verbindlichem Assetstandard

Für jedes weitere Stück werden mindestens benötigt: eigener Schnitt/Mesh, UVs, nachvollziehbare
Lizenz, Körper-/Rig-Zuordnung, Gewichte oder Simulationsbindung, Körpermaske, Stoff-/Materialdaten,
Pin-/Nahtgruppen, Kollisionsabstand und geprüfte Posen. Farbvarianten und andere Stoffwerte zählen
nicht als neue Schnitte.

|Familie                 |Einzeln vorzubereitende Teile                               |Besondere Prüfung|
|------------------------|------------------------------------------------------------|---|
|Basics/Streetwear       |Shirts, Tops, Hemden, Hoodies, Jeans, Shorts, Röcke         |Armloch, Bund, Saum, Taschen, Sitzen|
|Unterwäsche/Basisschicht|Oberteil, Unterteil, Unterhemd, Body, Strümpfe              |Körpernahe Passform, Abschlüsse, separate Auswahl|
|Bademode                |Badeanzug, separates Ober-/Unterteil, Badeshorts            |Elastische Abschlüsse, passende Gewichte|
|Sport/Performance       |Sportoberteil, Leggings, Trainingsjacke, Tanzkostüm         |Große Gelenkwinkel, Knie/Schulter, Saumkontakt|
|Formal/Kostüm           |Bluse, Sakko, Hose, Kleid, Overall, thematische Kostümteile |Mehrere Stofflagen, Verschlüsse|
|Außenlagen              |Jacke, Mantel, Schal                                        |Kollisionen gegen innere Kleidung|
|Schuhe/Accessoires      |Linker/rechter Schuh, Gürtel, Brille, Schmuck, Kopfbedeckung|Eigene Anker, Größenanpassung|

Die Referenzentwürfe im Startprojekt (Strick & Denim, Bordeaux, Rippwäsche, Sportbadeanzug,
Bomber & Cargo, Dance-Catsuit, Hoodie, Salbeistrick, Jerseywäsche, Tankini & Boardshorts, Denim
Streetwear, Zip-Playsuit) sind Vorlagen für diese Familien. Sie sind noch keine Modelle.
Die atelierV2-Slots (`innerTop`, `suit`, `outer`, `socks`, `headwear` …) bleiben im Projekt
erhalten und werden beim Import gemeldet.

## Abnahme jedes neuen Kleidungsstücks

Front, Seite und Rücken prüfen; danach Stehen, Sitzen, Armheben, gebeugte Knie (im Atelier als
Bewegungen „Arme heben“, „Knie beugen“, „Sitzen“). Nahaufnahmen von Hals, Schulter, Achsel, Bund,
Knie und Saum gehören dazu. Eine numerisch endliche Simulation ist keine visuelle Passformfreigabe.

## Quellen

* glTF 2.0: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
* three.js GLTFLoader: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
* Blender-Stoffparameter (4.3): https://docs.blender.org/manual/en/4.3/physics/cloth/settings/physical_properties.html
* Blender-Stoffkollisionen: https://docs.blender.org/manual/en/4.3/physics/cloth/settings/collisions.html
