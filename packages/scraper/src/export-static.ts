import { PLAUSIBLE_PRICE_SQL } from '@rmb/shared';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb, repoRoot } from '@rmb/db';

/**
 * Počet košov, do ktorých sa rozdelia detaily inzerátov. Klient stiahne
 * len ten kôš, v ktorom je práve otvorený byt — nie celých sedem megabajtov.
 */
const BUCKETS = 64;

/** Fotiek na inzerát. Galéria ich máva aj tridsať a URL sú dlhé; karta ukáže zlomok. */
const MAX_IMAGES = 6;

const bucketOf = (id: string): number =>
  parseInt(createHash('sha1').update(id).digest('hex').slice(0, 4), 16) % BUCKETS;

/**
 * Vyrobí statický export, z ktorého vie mapa bežať bez servera.
 *
 * Dôvod: crawl beží na GitHub Actions, kde po skončení nič nezostane bežať.
 * Databáza má 27 MB a do gitu nepatrí, ale to, čo z nej mapa naozaj
 * potrebuje, sa zmestí do zlomku.
 */
export function exportStatic(): { markers: number; bytes: number } {
  const db = getDb();
  const outDir = resolve(repoRoot, 'data/export');

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(resolve(outDir, 'details'), { recursive: true });

  let bytes = 0;
  const write = (path: string, value: unknown): void => {
    const json = JSON.stringify(value);
    bytes += Buffer.byteLength(json);
    writeFileSync(resolve(outDir, path), json);
  };

  const rows = db
    .prepare<[], Record<string, unknown>>(
      `SELECT * FROM listings
        WHERE is_active = 1 AND duplicate_of IS NULL AND is_unavailable = 0
          AND ${PLAUSIBLE_PRICE_SQL}`,
    )
    .all();

  const dupes = db
    .prepare<[], { canonicalId: string; source: string; sourceUrl: string }>(
      `SELECT duplicate_of AS canonicalId, source, source_url AS sourceUrl
         FROM listings WHERE duplicate_of IS NOT NULL AND is_active = 1`,
    )
    .all();

  const alsoOn = new Map<string, { source: string; sourceUrl: string }[]>();
  for (const d of dupes) {
    const list = alsoOn.get(d.canonicalId) ?? [];
    list.push({ source: d.source, sourceUrl: d.sourceUrl });
    alsoOn.set(d.canonicalId, list);
  }

  const history = db
    .prepare<[], { listing_id: string; price: number; seen_at: string }>(
      'SELECT listing_id, price, seen_at FROM price_history ORDER BY seen_at ASC',
    )
    .all();

  const historyByListing = new Map<string, { price: number; seenAt: string }[]>();
  for (const h of history) {
    const list = historyByListing.get(h.listing_id) ?? [];
    list.push({ price: h.price, seenAt: h.seen_at });
    historyByListing.set(h.listing_id, list);
  }

  const markers: Record<string, unknown[]> = { predaj: [], prenajom: [] };
  const details: Record<string, unknown>[][] = Array.from({ length: BUCKETS }, () => []);

  for (const row of rows) {
    const id = row['id'] as string;
    const firstPrice = historyByListing.get(id)?.[0]?.price ?? null;
    const price = row['price'] as number | null;

    markers[row['deal_type'] as string]?.push({
      id,
      lat: row['lat'],
      lng: row['lng'],
      price,
      propertyType: row['property_type'],
      rooms: row['rooms'],
      priceDiff: price != null && firstPrice != null && firstPrice !== price ? price - firstPrice : null,
      seenOn: (row['first_seen_at'] as string).slice(0, 10),
      publishedOn: (row['published_at'] as string | null)?.slice(0, 10) ?? null,
      imprecise: (row['location_radius'] as number | null ?? 0) >= 1000,
      priceRatio: row['price_ratio'],
    });

    details[bucketOf(id)]!.push({
      id,
      source: row['source'],
      sourceUrl: row['source_url'],
      dealType: row['deal_type'],
      propertyType: row['property_type'],
      price,
      pricePerM2: row['price_per_m2'],
      areaM2: row['area_m2'],
      rooms: row['rooms'],
      floor: row['floor'],
      condition: row['condition'],
      address: row['address'],
      title: row['title'],
      imageUrls: (JSON.parse(row['image_urls'] as string) as string[]).slice(0, MAX_IMAGES),
      locationRadius: row['location_radius'],
      areaPricePerM2: row['area_price_per_m2'],
      priceRatio: row['price_ratio'],
      estimatedRent: row['estimated_rent'],
      grossYield: row['gross_yield'],
      publishedAt: row['published_at'],
      firstSeenAt: row['first_seen_at'],
      alsoOn: alsoOn.get(id) ?? [],
      priceHistory: historyByListing.get(id) ?? [],
    });
  }

  write('markers-predaj.json', markers['predaj']);
  write('markers-prenajom.json', markers['prenajom']);
  details.forEach((bucket, i) => write(`details/${i}.json`, bucket));
  write('meta.json', {
    generatedAt: new Date().toISOString(),
    buckets: BUCKETS,
    predaj: markers['predaj']!.length,
    prenajom: markers['prenajom']!.length,
  });

  return { markers: rows.length, bytes };
}
