# Charakteratelier V5

Browser-Atelier für 3D-Figuren: Figuren im Editor-Modus konfigurieren, weitere Figuren aus
Herkunftsvorlagen erzeugen, Kleidung mit Stoffeigenschaften versehen, eigene (fotorealistische)
GLB-Figuren importieren und Blender-Stoffaufträge exportieren.

Das Projekt setzt das Startprojekt **Lissy & Clara** (`character-studio`, Schema 1 + `atelierV2`)
fort und ergänzt es um einen verlustfreien `atelierV5`-Abschnitt.

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm test             # 17 Unit-/Paritätstests (Node, ohne Browser)
npm run test:e2e     # Browser-Ende-zu-Ende (benötigt laufenden dev-Server + Playwright)
npm run build        # statisches Paket in dist/
```

## Was ist umgesetzt?

| Bereich | Stand |
|---|---|
| **Ansicht / Editor** | Umschaltbar. Studio mit Raster-Hohlkehle und Drehteller, Kameraansichten (Ganz, Gesicht, Oberkörper, Beine, Seite, Rücken), Foto-Export. |
| **Figuren** | Lissy und Clara aus dem Startprojekt; Duplizieren, Umbenennen, Löschen. |
| **Neue Figuren / Ethnien** | 12 Herkunftsvorlagen (bis zu 3 mischbar) erzeugen reproduzierbare Varianten aus breiten Bereichen: Hautton (10-stufige Skala + frei), Unterton, Haarstruktur (glatt/wellig/lockig/kraus) und Frisur, Augenfarbe, Sommersprossen, 12 Gesichtsregler. Alles bleibt editierbar. |
| **Körper** | 17 Regler (Größe, Gewicht, Schultern, Taille, Hüfte, Brust, Gesäß, Bauch, Muskulatur, Beine, Arme …). |
| **Kleidung & Stoff** | Die vier Modelle Strickpullover, T-Shirt, Wollhose, Cargohose; 12 Stoffvorlagen; 7 Eigenschaften je Figur und Kleidungsstück gespeichert. Rauheit wirkt live in WebGL, Dicke auf den Körperabstand, die Mechanik in den Blender-Auftrag. |
| **Eigene Figur (GLB)** | Vorprüfung (Container, Version, eingebettete Daten, keine Draco/Meshopt/KTX2, ≤150 MiB), Laden mit GLTFLoader ohne externe Nachladeversuche, Bericht (Meshes, Gelenke, Bilder inkl. Auflösung, Clips, Dreiecke, Budgets), SHA-256 + IndexedDB, Wiederherstellung nach Neuladen, „Basisfigur wählen“. |
| **Realistische Figur bearbeiten** | Materialien der Import-GLB werden klassifiziert (Haut, Haare, Augen, Zähne). Hautton und Haarfarbe werden **detailerhaltend** im Shader umgerechnet: Poren, Sommersprossen und Strähnen der Originaltextur bleiben erhalten. So lassen sich aus einem realistischen Master weitere Varianten ableiten. |
| **Posen, Gesten, Tänze** | Für jede Basisfigur: 7 Posen (u. a. Kontrapost, Hände in die Hüften, Arme verschränkt, Sitzen), 7 Gesten mit beweglichen Fingergelenken (Winken, Daumen hoch, Zeigen, Peace, Schulterzucken, Klatschen, Nicken), 7 Tänze im einstellbaren Tempo (Hip-Hop-Groove, Salsa, Disco, Schritt, Drehen, Wippen, Tanzfolge aus dem Projekt-JSON) und Passformtests. „Für alle Figuren übernehmen“ überträgt eine Bewegung auf alle Profile. Importfiguren nutzen ihre eingebetteten Clips; kein ungeprüftes Retargeting. |
| **Blender** | `produktion/configure_cloth.py` richtet aus dem exportierten Auftrag einen statischen Drapierungs-/Kollisionstest ein (massenerhaltend, Pin-Gruppe, Kollision, Selbstkollision, Solidify). |

## Fotorealismus: ehrliche Einordnung

Die **parametrische Basisfigur** wird vollständig im Browser erzeugt. Sie ist ein Proxy zum
Konfigurieren (Proportionen, Kleidung, Stoffe, Farben) und erreicht **nicht** die Qualität der
Referenzrenderings. Fotorealistische Figuren wie in den Referenzbildern brauchen einen
**realistischen Master**: gescannte oder hochwertig modellierte Geometrie mit 4K-PBR-Hauttexturen,
Normal-/Rauheitsmaps und einem Haar-Groom bzw. Haarkarten. Dieser Master wird als GLB importiert
und ist dann im Editor bearbeitbar. Details und Lieferanforderungen: [docs/REALISMUS.md](docs/REALISMUS.md).

## Dokumentation

* [docs/KLEIDUNG_STOFFE_V5.md](docs/KLEIDUNG_STOFFE_V5.md) – Kleidung, Stoffvorlagen, Eigenschaften, Blender-Workflow, Assetstandard
* [docs/EIGENE_FIGUREN.md](docs/EIGENE_FIGUREN.md) – Formate, GLB-Anforderungen, Blender-Export, lokale Speicherung
* [docs/REALISMUS.md](docs/REALISMUS.md) – Weg zu fotorealistischen Figuren, weitere Ethnien aus realistischen Mastern
* [ASSET_QUELLEN_UND_LIZENZEN.md](ASSET_QUELLEN_UND_LIZENZEN.md)

## Aufbau

```
src/core/      reine Logik (Stoffe, Kleidung, Anatomie, Erscheinung, Projektformat, GLB-Prüfung, Stoffauftrag, IndexedDB)
src/render/    three.js: Studio, parametrische Figur, Texturen, Bewegung, GLB-Import, Realismus-Shader
src/ui/        Stylesheet
public/beispiele/Lissy_und_Clara_Startprojekt.json
produktion/    Blender-Skript + Beispielauftrag
tests/unit/    Node-Tests;  tests/e2e/smoke.mjs  Browser-Test
```
