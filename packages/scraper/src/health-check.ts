import { countBySource, countListings, getDb } from '@rmb/db';

/**
 * Kontrola po zbere. Testy overujú, že kód robí, čo má; toto overuje, že
 * výsledok dáva zmysel — teda veci, ktoré sa pokazia bez zmeny jediného
 * riadku: portál prekope HTML, zmení stránkovanie alebo nás začne blokovať.
 *
 * Zámerne padá nahlas. Tichý beh, ktorý vyrobí prázdnu mapu, je horší než
 * beh, ktorý zakričí.
 */
export function healthCheck(): { problems: string[]; summary: string[] } {
  const db = getDb();
  const problems: string[] = [];
  const summary: string[] = [];

  const counts = countListings();
  summary.push(`${counts.unique} inzerátov na mape (${counts.total} v databáze)`);

  if (counts.unique < 500) {
    problems.push(`na mape je len ${counts.unique} inzerátov — zber zjavne zlyhal`);
  }

  for (const row of countBySource()) {
    summary.push(`  ${row.source}: ${row.total} (${row.unique} na mape)`);
  }

  const bezSuradnic = db
    .prepare<[], { c: number }>(
      'SELECT COUNT(*) AS c FROM listings WHERE is_active = 1 AND (lat IS NULL OR lng IS NULL)',
    )
    .get()!.c;
  if (bezSuradnic > 0) problems.push(`${bezSuradnic} inzerátov bez súradníc`);

  const mimoBratislavy = db
    .prepare<[], { c: number }>(
      `SELECT COUNT(*) AS c FROM listings WHERE is_active = 1
        AND (lat NOT BETWEEN 48.0 AND 48.35 OR lng NOT BETWEEN 16.85 AND 17.4)`,
    )
    .get()!.c;
  if (mimoBratislavy > 0) problems.push(`${mimoBratislavy} inzerátov mimo Bratislavy`);

  // Chýbajúca cena je bežná ("dohodou"), ale keď ju nemá väčšina, rozbil sa parser.
  const bezCeny = db
    .prepare<[], { c: number; spolu: number }>(
      `SELECT SUM(price IS NULL) AS c, COUNT(*) AS spolu
         FROM listings WHERE is_active = 1 AND duplicate_of IS NULL`,
    )
    .get()!;
  const podielBezCeny = bezCeny.spolu > 0 ? bezCeny.c / bezCeny.spolu : 0;
  summary.push(`bez ceny: ${Math.round(podielBezCeny * 100)} %`);
  if (podielBezCeny > 0.3) {
    problems.push(`${Math.round(podielBezCeny * 100)} % inzerátov nemá cenu — podozrivé`);
  }

  const nezmyselneCeny = db
    .prepare<[], { c: number }>(
      `SELECT COUNT(*) AS c FROM listings
        WHERE is_active = 1 AND deal_type = 'predaj' AND price IS NOT NULL
          AND (price < 20000 OR price > 20000000)`,
    )
    .get()!.c;
  if (nezmyselneCeny > 0) summary.push(`nezmyselných cien: ${nezmyselneCeny} (na mapu nejdú)`);

  // Nula aj jednotka sú zástupné hodnoty pre "cenu na vyžiadanie" a sú bežné.
  // Na mapu sa aj tak nedostanú. Podozrivé je, až keď takých pribudne veľa
  // naraz — to znamená rozbitý parser ceny, nie zopár zvláštnych inzerátov.
  const podozrive = db
    .prepare<[], { c: number; spolu: number }>(
      `SELECT SUM(price BETWEEN 2 AND 5000) AS c, COUNT(*) AS spolu
         FROM listings WHERE is_active = 1 AND deal_type = 'predaj' AND price IS NOT NULL`,
    )
    .get()!;
  const podiel = podozrive.spolu > 0 ? podozrive.c / podozrive.spolu : 0;
  if (podiel > 0.02) {
    problems.push(
      `${podozrive.c} predajov (${Math.round(podiel * 100)} %) má cenu v rozsahu nájmu — ` +
        'zrejme sa rozbilo parsovanie ceny',
    );
  }

  const dopyty = db
    .prepare<[], { c: number }>(
      `SELECT COUNT(*) AS c FROM listings
        WHERE is_active = 1 AND duplicate_of IS NULL AND is_unavailable = 0
          AND (title LIKE 'Hľadám%' OR title LIKE 'Hľadáme%' OR title LIKE 'Kúpim%'
               OR title LIKE 'Výmena%')`,
    )
    .get()!.c;
  if (dopyty > 0) problems.push(`${dopyty} dopytov ("hľadám byt") sa tvári ako ponuka`);

  const bezIndexu = db
    .prepare<[], { c: number; spolu: number }>(
      `SELECT SUM(price_ratio IS NULL) AS c, COUNT(*) AS spolu
         FROM listings WHERE is_active = 1 AND duplicate_of IS NULL AND is_unavailable = 0`,
    )
    .get()!;
  if (bezIndexu.spolu > 0 && bezIndexu.c / bezIndexu.spolu > 0.2) {
    problems.push(`${bezIndexu.c} inzerátov bez indexu cien — prepočet zrejme nezbehol`);
  }

  return { problems, summary };
}
