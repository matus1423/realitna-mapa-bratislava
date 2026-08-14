import { getDb } from '@rmb/db';
import { Grid } from './grid.js';

export interface YieldResult {
  computed: number;
  skipped: number;
}

interface Row {
  id: string;
  lat: number;
  lng: number;
  area_m2: number;
  price: number;
}

/**
 * Odhadne mesačný nájom bytu na predaj a z neho hrubý výnos.
 *
 * Postup: z inzerátov na prenájom v okolí sa vezme medián nájmu za m² a
 * vynásobí plochou posudzovaného bytu. Presnejšie to bez znalosti konkrétnej
 * nehnuteľnosti nejde — dvojizbák po rekonštrukcii a dvojizbák v pôvodnom
 * stave sa v tej istej ulici prenajímajú za výrazne iné peniaze.
 *
 * Výnos je zámerne **hrubý**: nezohľadňuje daň, správu, poistenie, opravy
 * ani neobsadenosť. Čisté číslo býva zhruba o tretinu nižšie. Slúži na
 * porovnávanie bytov medzi sebou, nie ako podklad pre investičné rozhodnutie.
 */
export function computeRentalYield(): YieldResult {
  const db = getDb();

  const rentals = db
    .prepare<[], { lat: number; lng: number; price_per_m2: number }>(
      `SELECT lat, lng, price_per_m2
         FROM listings
        WHERE is_active = 1 AND duplicate_of IS NULL AND is_unavailable = 0 AND deal_type = 'prenajom'
          AND price_per_m2 IS NOT NULL AND price_per_m2 > 0`,
    )
    .all();

  const rentGrid = new Grid();
  for (const rental of rentals) rentGrid.add(rental.lat, rental.lng, rental.price_per_m2);

  const sales = db
    .prepare<[], Row>(
      `SELECT id, lat, lng, area_m2, price
         FROM listings
        WHERE is_active = 1 AND duplicate_of IS NULL AND is_unavailable = 0 AND deal_type = 'predaj'
          AND area_m2 IS NOT NULL AND area_m2 > 0 AND price IS NOT NULL AND price > 0`,
    )
    .all();

  const update = db.prepare(
    'UPDATE listings SET estimated_rent = ?, gross_yield = ? WHERE id = ?',
  );
  const clear = db.prepare(
    'UPDATE listings SET estimated_rent = NULL, gross_yield = NULL WHERE id = ?',
  );

  const result: YieldResult = { computed: 0, skipped: 0 };

  db.transaction(() => {
    for (const sale of sales) {
      const rentPerM2 = rentGrid.medianAround(sale.lat, sale.lng);

      if (rentPerM2 == null) {
        clear.run(sale.id);
        result.skipped++;
        continue;
      }

      const monthlyRent = rentPerM2 * sale.area_m2;
      const grossYield = (monthlyRent * 12) / sale.price;

      update.run(Math.round(monthlyRent), Math.round(grossYield * 10_000) / 10_000, sale.id);
      result.computed++;
    }
  })();

  return result;
}
