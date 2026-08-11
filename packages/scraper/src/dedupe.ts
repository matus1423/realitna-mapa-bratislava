import { getDb } from '@rmb/db';

export interface DedupeResult {
  /** Duplicity spárované cez zhodné ID naprieč sieťou United Classifieds. */
  byId: number;
  /** Duplicity spárované cez polohu, plochu a cenu. */
  byMatch: number;
  marked: number;
}

/**
 * Poradie zdrojov pri výbere kanonického záznamu. Vyhráva ten, ktorý dáva
 * najviac štruktúrovaných polí a najpresnejšiu polohu — Bazoš je posledný,
 * lebo jeho súradnica je len ťažisko PSČ.
 */
const PRIORITY = ['nehnutelnosti', 'reality', 'zoznamrealit', 'topreality', 'bazos'];

/**
 * Označí duplicitné inzeráty naprieč portálmi. Nič nemaže — len nastaví
 * `duplicate_of`, takže sa dá kedykoľvek pozrieť, na ktorých portáloch tá istá
 * nehnuteľnosť visí, a mapa zobrazuje iba kanonický záznam.
 */
export function dedupe(): DedupeResult {
  const db = getDb();
  const result: DedupeResult = { byId: 0, byMatch: 0, marked: 0 };

  const rank = new Map(PRIORITY.map((source, index) => [source, index]));
  const better = (a: string, b: string): boolean =>
    (rank.get(a) ?? 99) < (rank.get(b) ?? 99);

  interface Row {
    id: string;
    source: string;
    source_id: string;
    lat: number;
    lng: number;
    price: number | null;
    area_m2: number | null;
    rooms: number | null;
  }

  const rows = db
    .prepare<[], Row>(
      `SELECT id, source, source_id, lat, lng, price, area_m2, rooms
         FROM listings WHERE is_active = 1 ORDER BY id`,
    )
    .all();

  const canonical = new Map<string, Row>();
  const assignments: { duplicate: string; canonical: string }[] = [];

  const claim = (key: string, row: Row, kind: 'byId' | 'byMatch'): void => {
    const held = canonical.get(key);
    if (!held) {
      canonical.set(key, row);
      return;
    }
    // z dvojice si necháme kvalitnejší zdroj a druhý označíme za duplicitu
    const [keep, drop] = better(row.source, held.source) ? [row, held] : [held, row];
    canonical.set(key, keep);
    assignments.push({ duplicate: drop.id, canonical: keep.id });
    result[kind]++;
  };

  for (const row of rows) {
    // nehnutelnosti.sk a reality.sk zdieľajú ID — presná zhoda, žiadny odhad
    claim(`id:${row.source_id}`, row, 'byId');
  }

  for (const row of rows) {
    if (row.price == null || row.area_m2 == null) continue;
    // ~100 m mriežka + zaokrúhlená plocha a cena; presnejšie to nemá zmysel,
    // lebo portály uvádzajú polohu s rôznou presnosťou
    const key = [
      'match',
      row.lat.toFixed(3),
      row.lng.toFixed(3),
      Math.round(row.area_m2),
      Math.round(row.price / 1000),
    ].join(':');
    claim(key, row, 'byMatch');
  }

  const clear = db.prepare('UPDATE listings SET duplicate_of = NULL');
  const mark = db.prepare('UPDATE listings SET duplicate_of = ? WHERE id = ?');

  db.transaction(() => {
    clear.run();
    for (const { duplicate, canonical: keep } of assignments) {
      if (duplicate === keep) continue;
      mark.run(keep, duplicate);
      result.marked++;
    }
  })();

  return result;
}
