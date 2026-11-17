# Fotorealistische Figuren

## Warum die Basisfigur nicht fotorealistisch ist

Die Referenzbilder (Lissy, Clara im Scan-Studio) zeigen Figuren mit gescannter Hautoberfläche,
mehreren Millionen Polygonen im Master, 4K-8K-Texturen (Albedo, Normal, Rauheit, Kavität),
Subsurface-Scattering und Tausenden einzeln gerenderten Haarsträhnen. Das lässt sich nicht aus
Formeln im Browser erzeugen. Die parametrische Basisfigur dieses Projekts ist deshalb ein **Proxy**:
Sie trägt Proportionen, Kleidung, Stoffe und Farben und macht Passformtests möglich.

## Der Weg zum realistischen Ergebnis

1. **Realistischen Master bereitstellen.** Die ursprünglichen Lissy-/Clara-GLB- und Blender-Master
   aus `Charakteratelier_V23_Quellcode_und_Startpaket.zip` (`masters/<name>/<name>_master.blend`)
   sind dafür vorgesehen. Alternativ eine eigene gescannte oder mit einem Character-Tool erzeugte Figur.
2. **Als GLB exportieren** (Blender: Datei → Exportieren → glTF 2.0 → glTF Binary). Ohne
   Draco/Meshopt/KTX2, Texturen eingebettet. Siehe [EIGENE_FIGUREN.md](EIGENE_FIGUREN.md).
3. **Im Atelier importieren:** Tab „Eigene Figur“ → „GLB importieren“.
4. **Im Editor bearbeiten:**
   * Materialien werden nach Namen klassifiziert: `skin/haut/body/head/face/arm/leg …` → Haut,
     `hair/haar/brow/lash …` → Haare, `eye/iris/cornea …` → Augen.
   * „Hautton anwenden“ / „Haarfarbe anwenden“: Die Originaltextur wird durch ihre eigene
     Durchschnittsfarbe geteilt und mit der Zielfarbe multipliziert. Poren, Sommersprossen,
     Rötungen und Strähnen bleiben erhalten.
   * Hautmaterial erhält eine weiche Streulicht-Komponente (Sheen) als Annäherung an
     Subsurface-Scattering; Haare Anisotropie und Alpha-Test.
   * Jedes Material ist zusätzlich einzeln in Farbe und Rauheit einstellbar und wird im Projekt gespeichert.

## Weitere Herkunft/Ethnien aus einem realistischen Master

* **Hautton, Unterton, Haarfarbe:** Figur duplizieren, unter „Erscheinung“ Hautton wählen
  (oder eine Herkunftsvorlage), „Hautton anwenden“ aktivieren. Das wirkt direkt und realistisch,
  weil die Hautdetails der Scan-Textur erhalten bleiben.
* **Gesichtsform, Haarstruktur:** Diese lassen sich durch Umfärben nicht glaubwürdig ändern.
  Dafür braucht der Master entweder **Morph Targets** (Shape Keys, z. B. Nasenbreite, Lippen,
  Lidfalte) oder eine **eigene Scan-/Modellvariante** je Person. Morph Targets werden bereits
  importiert und im Bericht gezählt; die Bindung an die Gesichtsregler ist der nächste Ausbauschritt.
* Unterschiedliche Menschen sollten als unterschiedliche Personen modelliert werden, nicht als
  Einfärbung eines einzigen Gesichts. Die Herkunftsvorlagen liefern dafür nur Startwerte.

## Empfohlener Lieferumfang je realistischer Figur

| Teil | Empfehlung |
|---|---|
| Geometrie | Retopologisiertes Körper-Mesh, 50k–100k Dreiecke für Mobilgeräte, bis ~300k für Desktop |
| Texturen | Albedo, Normal, Rauheit (ggf. ORM) für Haut; 2K mobil, 4K Desktop; eingebettet |
| Haare | Haarkarten (Alpha) oder vereinfachter Groom, eigenes Material mit „hair“ im Namen |
| Augen | Separater Augapfel + Hornhaut, Materialname mit „eye“/„cornea“ |
| Rig | Humanoides Skelett mit normalisierten Gewichten, A-/T-Bindepose |
| Morphs | Optional: Gesichts-Shape-Keys für spätere Reglerbindung |
| Namen | Materialien sprechend benennen (`Skin_Body`, `Skin_Head`, `Hair`, `Eye_L` …) |

## Aktueller Stand der Prüfung

Der vollständige Importpfad (Prüfung, Laden, Klassifizierung, Hautton-Umrechnung,
Wiederherstellung nach Neuladen, Rückkehr zur Basisfigur) ist im Browser-Test mit einer aus der
Basisfigur exportierten GLB geprüft. Ein echter Scan-Master lag in dieser Umgebung nicht vor;
die visuelle Qualität mit einem solchen Master ist deshalb noch zu prüfen.
