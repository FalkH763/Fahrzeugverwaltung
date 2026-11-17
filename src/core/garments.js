// Die vier tatsächlich vorhandenen Kleidungsmodelle (V5).
// Farbvarianten oder andere Stoffwerte sind keine neuen Schnitte.

export const GARMENTS = Object.freeze([
  Object.freeze({
    id: 'sweater', label: 'Strickpullover', slot: 'top', defaultFabric: 'woolKnit',
    pin: 'neck_shoulder', simulation: 'Oberen Rand-/Schulterbereich fixieren; Ärmel, Achsel und Saum prüfen',
    blenderObject: 'Garment_Sweater', ease: 0.011, sleeve: 'long', hem: 'hip',
  }),
  Object.freeze({
    id: 'tshirt', label: 'T-Shirt', slot: 'top', defaultFabric: 'jersey',
    pin: 'neck_shoulder', simulation: 'Oberen Rand fixieren; ausreichend Körperabstand und Armlochfreiheit',
    blenderObject: 'Garment_TShirt', ease: 0.010, sleeve: 'short', hem: 'hip',
  }),
  Object.freeze({
    id: 'woolTrousers', label: 'Wollhose', slot: 'bottom', defaultFabric: 'woolWoven',
    pin: 'waistband', simulation: 'Bund fixieren; Knie, Hüfte und Sitzfalten prüfen; Stoffvorlage bei Bedarf ändern',
    blenderObject: 'Garment_WoolTrousers', ease: 0.012, leg: 'straight',
  }),
  Object.freeze({
    id: 'cargo', label: 'Cargohose', slot: 'bottom', defaultFabric: 'cotton',
    pin: 'waistband', simulation: 'Bund fixieren; Taschen, Schrittraum und Knie prüfen',
    blenderObject: 'Garment_Cargo', ease: 0.022, leg: 'wide', pockets: true,
  }),
]);

const MAP = new Map(GARMENTS.map((g) => [g.id, g]));
export const getGarment = (id) => MAP.get(id) || null;
export const garmentsForSlot = (slot) => GARMENTS.filter((g) => g.slot === slot);

/**
 * Zuordnung von Kleidungs-IDs älterer Atelier-Versionen (z. B. V2/V23-Projekt-JSON)
 * auf die vier V5-Modelle. Die Original-ID bleibt im Profil erhalten (legacyItem).
 */
export const LEGACY_ITEM_MAP = Object.freeze({
  sweater: 'sweater', knit: 'sweater', hoodie: 'sweater', cardigan: 'sweater',
  tshirt: 'tshirt', 't-shirt': 'tshirt', shirt: 'tshirt', tank: 'tshirt', top: 'tshirt',
  trousers: 'woolTrousers', straight: 'woolTrousers', slacks: 'woolTrousers', jeans: 'woolTrousers', chino: 'woolTrousers',
  cargo: 'cargo', cargopants: 'cargo', wide: 'cargo', baggy: 'cargo',
  none: 'none',
});

export function mapLegacyItem(slot, item) {
  if (!item || item === 'none') return { id: 'none', exact: true };
  const direct = getGarment(item);
  if (direct && direct.slot === slot) return { id: item, exact: true };
  const mapped = LEGACY_ITEM_MAP[String(item).toLowerCase()];
  if (mapped && (mapped === 'none' || getGarment(mapped)?.slot === slot)) return { id: mapped, exact: false };
  const fallback = slot === 'top' ? 'tshirt' : 'woolTrousers';
  return { id: fallback, exact: false, unknown: true };
}
