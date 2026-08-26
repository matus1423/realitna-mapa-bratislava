import type { DealType, ListingMarker } from '@rmb/shared';

/**
 * Odkiaľ appka berie dáta.
 *
 * Vo vývoji beží Fastify a dotazuje sa SQLite. V nasadení žiadny server nie je —
 * crawl beží na GitHub Actions a po sebe zanechá len statický export, takže
 * mapa si stiahne markery raz a filtruje ich u seba.
 *
 * `VITE_DATA_URL` prepína medzi tým; keď nie je nastavená, ide sa cez API.
 */
const STATIC_BASE = import.meta.env['VITE_DATA_URL'] as string | undefined;

export const isStatic = Boolean(STATIC_BASE);

export interface ListingDetail {
  id: string;
  source: string;
  sourceUrl: string;
  dealType: DealType;
  propertyType: string;
  price: number | null;
  pricePerM2: number | null;
  areaM2: number | null;
  rooms: number | null;
  floor: number | null;
  condition: string | null;
  address: string | null;
  title: string;
  imageUrls: string[];
  locationRadius: number | null;
  areaPricePerM2: number | null;
  priceRatio: number | null;
  estimatedRent: number | null;
  grossYield: number | null;
  publishedAt: string | null;
  firstSeenAt: string;
  alsoOn: { source: string; sourceUrl: string }[];
  priceHistory: { price: number; seenAt: string }[];
}

const markerCache = new Map<DealType, Promise<ListingMarker[]>>();
const bucketCache = new Map<number, Promise<ListingDetail[]>>();
let bucketCount: Promise<number> | null = null;

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url} vrátilo ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Markery celého mesta. V statickom režime je to jeden súbor (~70 kB po gzipe),
 * takže sa načíta raz a bbox aj filtre riešime u klienta — mapa potom
 * nečaká na sieť pri každom posune.
 */
export function loadMarkers(dealType: DealType, signal?: AbortSignal): Promise<ListingMarker[]> {
  if (!STATIC_BASE) throw new Error('loadMarkers je len pre statický režim');

  const cached = markerCache.get(dealType);
  if (cached) return cached;

  const promise = json<ListingMarker[]>(`${STATIC_BASE}/markers-${dealType}.json`, signal);
  markerCache.set(dealType, promise);
  return promise;
}

/** Kôš, v ktorom je detail daného inzerátu. Musí sedieť s exportérom. */
async function bucketOf(id: string): Promise<number> {
  bucketCount ??= json<{ buckets: number }>(`${STATIC_BASE}/meta.json`).then((m) => m.buckets);

  const bytes = new TextEncoder().encode(id);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  const hex = [...new Uint8Array(digest)]
    .slice(0, 2)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return parseInt(hex, 16) % (await bucketCount);
}

export async function loadDetails(ids: string[], signal?: AbortSignal): Promise<ListingDetail[]> {
  if (!STATIC_BASE) {
    const params = new URLSearchParams({ ids: ids.join(',') });
    const data = await json<{ listings: ListingDetail[] }>(
      `/api/listings/by-id?${params.toString()}`,
      signal,
    );
    return data.listings;
  }

  const buckets = new Set(await Promise.all(ids.map(bucketOf)));
  const loaded = await Promise.all(
    [...buckets].map((bucket) => {
      const cached = bucketCache.get(bucket);
      if (cached) return cached;
      const promise = json<ListingDetail[]>(`${STATIC_BASE}/details/${bucket}.json`, signal);
      bucketCache.set(bucket, promise);
      return promise;
    }),
  );

  const wanted = new Set(ids);
  return loaded.flat().filter((listing) => wanted.has(listing.id));
}
