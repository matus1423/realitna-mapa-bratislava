import { getDb } from '@rmb/db';
import { Grid } from './grid.js';

export interface PriceIndexResult {
  computed: number;
  skipped: number;
}

interface Row {
  id: string;
  lat: number;
  lng: number;
  price_per_m2: number;
  deal_type: string;
}

/**
 * Ku každému bytu dopočíta medián €/m² v jeho okolí a pomer jeho vlastnej
 * ceny k tomuto mediánu. To je jediné číslo, ktoré z mapy cien robí mapu
 * príležitostí — bez neho používateľ nevie, či je 4 500 €/m² veľa alebo málo,
 * lebo v Starom Meste je to normál a v Petržalke nadpriemer.
 *
 * Medián, nie priemer: jeden penthouse za tri milióny by priemer v okolí
 * vytiahol tak, že by všetko ostatné vyzeralo ako výhodná kúpa.
 */
export function computePriceIndex(): PriceIndexResult {
  const db = getDb();

  const rows = db
    .prepare<[], Row>(
      `SELECT id, lat, lng, price_per_m2, deal_type
         FROM listings
        WHERE is_active = 1 AND duplicate_of IS NULL
          AND price_per_m2 IS NOT NULL AND price_per_m2 > 0`,
    )
    .all();

  // predaj a prenájom sú dva nesúvisiace trhy — mriežka je pre každý vlastná
  const grids = new Map<string, Grid>();
  for (const row of rows) {
    let grid = grids.get(row.deal_type);
    if (!grid) {
      grid = new Grid();
      grids.set(row.deal_type, grid);
    }
    grid.add(row.lat, row.lng, row.price_per_m2);
  }

  const update = db.prepare(
    'UPDATE listings SET area_price_per_m2 = ?, price_ratio = ? WHERE id = ?',
  );
  const clear = db.prepare(
    'UPDATE listings SET area_price_per_m2 = NULL, price_ratio = NULL WHERE id = ?',
  );

  const result: PriceIndexResult = { computed: 0, skipped: 0 };

  db.transaction(() => {
    for (const row of rows) {
      const areaMedian = grids.get(row.deal_type)?.medianAround(row.lat, row.lng) ?? null;

      if (areaMedian == null) {
        clear.run(row.id);
        result.skipped++;
        continue;
      }

      update.run(
        Math.round(areaMedian),
        Math.round((row.price_per_m2 / areaMedian) * 1000) / 1000,
        row.id,
      );
      result.computed++;
    }
  })();

  return result;
}
