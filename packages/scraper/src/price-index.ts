import { getDb } from '@rmb/db';

/**
 * Veľkosť bunky mriežky. 0,005° zemepisnej šírky je ~555 m; na 48° severnej
 * šírky je poludník kratší, preto je krok pre dĺžku väčší, aby bunka
 * vyšla zhruba štvorcová.
 */
const CELL_LAT = 0.005;
const CELL_LNG = 0.0075;

/** Koľko bytov musí byť v okolí, aby mal medián zmysel. */
const MIN_SAMPLE = 8;

export interface PriceIndexResult {
  computed: number;
  skipped: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

interface Row {
  id: string;
  lat: number;
  lng: number;
  price_per_m2: number;
  deal_type: string;
}

/** Predaj a prenájom sú dva nesúvisiace trhy — mriežka je pre každý vlastná. */
const cellKey = (lat: number, lng: number, dealType: string): string =>
  `${dealType}:${Math.floor(lat / CELL_LAT)}:${Math.floor(lng / CELL_LNG)}`;

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

  // byty rozhádžeme do mriežky, aby sa okolie hľadalo v deviatich bunkách
  // namiesto porovnávania každého s každým
  const grid = new Map<string, number[]>();
  for (const row of rows) {
    const key = cellKey(row.lat, row.lng, row.deal_type);
    const bucket = grid.get(key);
    if (bucket) bucket.push(row.price_per_m2);
    else grid.set(key, [row.price_per_m2]);
  }

  /** Ceny z okolia; `ring` 1 = 3×3 bunky, 2 = 5×5. */
  function neighbourhood(lat: number, lng: number, dealType: string, ring: number): number[] {
    const baseLat = Math.floor(lat / CELL_LAT);
    const baseLng = Math.floor(lng / CELL_LNG);
    const out: number[] = [];

    for (let dLat = -ring; dLat <= ring; dLat++) {
      for (let dLng = -ring; dLng <= ring; dLng++) {
        const bucket = grid.get(`${dealType}:${baseLat + dLat}:${baseLng + dLng}`);
        if (bucket) out.push(...bucket);
      }
    }

    return out;
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
      // v riedkych častiach mesta rozšírime okolie, radšej hrubší odhad
      // než žiadny; ak ani 5×5 nestačí, index nedávame vôbec
      let sample = neighbourhood(row.lat, row.lng, row.deal_type, 1);
      if (sample.length < MIN_SAMPLE) sample = neighbourhood(row.lat, row.lng, row.deal_type, 2);

      if (sample.length < MIN_SAMPLE) {
        clear.run(row.id);
        result.skipped++;
        continue;
      }

      const areaMedian = median(sample);
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
