import type { BBox, Listing, ListingFilters, ListingMarker, PropertyType } from '@rmb/shared';
import { getDb } from './client.js';

interface ListingRow {
  id: string;
  source: string;
  source_id: string;
  source_url: string;
  deal_type: string;
  property_type: string;
  price: number | null;
  price_currency: string;
  price_per_m2: number | null;
  lat: number;
  lng: number;
  location_radius: number | null;
  address: string | null;
  street: string | null;
  city: string | null;
  district: string | null;
  area_m2: number | null;
  land_area_m2: number | null;
  rooms: number | null;
  rooms_raw: string | null;
  floor: number | null;
  condition: string | null;
  has_elevator: number | null;
  title: string;
  description: string | null;
  image_urls: string;
  advertiser_name: string | null;
  advertiser_type: string | null;
  published_at: string | null;
  first_seen_at: string;
  scraped_at: string;
}

function rowToListing(row: ListingRow): Listing {
  return {
    id: row.id,
    source: row.source as Listing['source'],
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    dealType: row.deal_type as Listing['dealType'],
    propertyType: row.property_type as PropertyType,
    price: row.price,
    priceCurrency: row.price_currency,
    pricePerM2: row.price_per_m2,
    lat: row.lat,
    lng: row.lng,
    locationRadius: row.location_radius,
    address: row.address,
    street: row.street,
    city: row.city,
    district: row.district,
    areaM2: row.area_m2,
    landAreaM2: row.land_area_m2,
    rooms: row.rooms,
    roomsRaw: row.rooms_raw,
    floor: row.floor,
    condition: row.condition,
    hasElevator: row.has_elevator == null ? null : row.has_elevator === 1,
    title: row.title,
    description: row.description,
    imageUrls: JSON.parse(row.image_urls) as string[],
    advertiserName: row.advertiser_name,
    advertiserType: row.advertiser_type,
    publishedAt: row.published_at,
    firstSeenAt: row.first_seen_at,
    scrapedAt: row.scraped_at,
  };
}

/**
 * Zapíše inzerát a zároveň zaznamená cenu do histórie, ak sa zmenila.
 * `first_seen_at` sa pri opakovanom behu nemení — preto COALESCE na starú hodnotu.
 */
export function upsertListing(listing: Listing): void {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO listings (
      id, source, source_id, source_url, deal_type, property_type,
      price, price_currency, price_per_m2, lat, lng, location_radius,
      address, street, city, district,
      area_m2, land_area_m2, rooms, rooms_raw, floor, condition, has_elevator,
      title, description, image_urls, advertiser_name, advertiser_type,
      published_at, first_seen_at, scraped_at, is_active
    ) VALUES (
      @id, @source, @sourceId, @sourceUrl, @dealType, @propertyType,
      @price, @priceCurrency, @pricePerM2, @lat, @lng, @locationRadius,
      @address, @street, @city, @district,
      @areaM2, @landAreaM2, @rooms, @roomsRaw, @floor, @condition, @hasElevator,
      @title, @description, @imageUrls, @advertiserName, @advertiserType,
      @publishedAt, @firstSeenAt, @scrapedAt, 1
    )
    ON CONFLICT (id) DO UPDATE SET
      source_url    = excluded.source_url,
      price         = excluded.price,
      price_per_m2  = excluded.price_per_m2,
      lat           = excluded.lat,
      lng           = excluded.lng,
      address       = excluded.address,
      area_m2       = excluded.area_m2,
      rooms         = excluded.rooms,
      floor         = excluded.floor,
      condition     = excluded.condition,
      title         = excluded.title,
      description   = excluded.description,
      image_urls    = excluded.image_urls,
      scraped_at    = excluded.scraped_at,
      is_active     = 1
  `);

  const historyStmt = db.prepare(`
    INSERT OR IGNORE INTO price_history (listing_id, price, seen_at)
    VALUES (?, ?, ?)
  `);

  const lastPriceStmt = db.prepare<[string], { price: number }>(`
    SELECT price FROM price_history WHERE listing_id = ? ORDER BY seen_at DESC LIMIT 1
  `);

  db.transaction(() => {
    stmt.run({
      ...listing,
      hasElevator: listing.hasElevator == null ? null : listing.hasElevator ? 1 : 0,
      imageUrls: JSON.stringify(listing.imageUrls),
    });

    if (listing.price != null) {
      const last = lastPriceStmt.get(listing.id);
      if (!last || last.price !== listing.price) {
        historyStmt.run(listing.id, listing.price, listing.scrapedAt);
      }
    }
  })();
}

interface FindOptions extends ListingFilters {
  bbox: BBox;
  limit?: number;
}

function buildWhere(opts: FindOptions): { sql: string; params: unknown[] } {
  const clauses: string[] = [
    'l.is_active = 1',
    // duplicity z iných portálov na mapu nepatria
    'l.duplicate_of IS NULL',
    'l.lat BETWEEN ? AND ?',
    'l.lng BETWEEN ? AND ?',
  ];
  const params: unknown[] = [
    opts.bbox.latMin,
    opts.bbox.latMax,
    opts.bbox.lngMin,
    opts.bbox.lngMax,
  ];

  if (opts.dealType) {
    clauses.push('l.deal_type = ?');
    params.push(opts.dealType);
  }
  if (opts.propertyTypes?.length) {
    clauses.push(`l.property_type IN (${opts.propertyTypes.map(() => '?').join(',')})`);
    params.push(...opts.propertyTypes);
  }
  if (opts.priceMin != null) {
    clauses.push('l.price >= ?');
    params.push(opts.priceMin);
  }
  if (opts.priceMax != null) {
    clauses.push('l.price <= ?');
    params.push(opts.priceMax);
  }
  if (opts.areaMin != null) {
    clauses.push('l.area_m2 >= ?');
    params.push(opts.areaMin);
  }
  if (opts.areaMax != null) {
    clauses.push('l.area_m2 <= ?');
    params.push(opts.areaMax);
  }
  if (opts.rooms?.length) {
    // "5+ izb" posielame ako 5 a berieme aj väčšie
    const hasFivePlus = opts.rooms.includes(5);
    const exact = opts.rooms.filter((r) => r !== 5);
    const parts: string[] = [];
    if (exact.length) {
      parts.push(`l.rooms IN (${exact.map(() => '?').join(',')})`);
      params.push(...exact);
    }
    if (hasFivePlus) parts.push('l.rooms >= 5');
    if (parts.length) clauses.push(`(${parts.join(' OR ')})`);
  }

  return { sql: clauses.join(' AND '), params };
}

/**
 * Odľahčený tvar pre markery. `price_diff` je rozdiel aktuálnej ceny
 * oproti prvej zaznamenanej — záporné číslo znamená zlacnenie.
 */
export function findMarkersInBBox(opts: FindOptions): ListingMarker[] {
  const db = getDb();
  const { sql, params } = buildWhere(opts);
  const limit = opts.limit ?? 5000;

  const rows = db
    .prepare<unknown[], {
      id: string;
      lat: number;
      lng: number;
      price: number | null;
      property_type: string;
      rooms: number | null;
      first_price: number | null;
      published_at: string | null;
    }>(
      `SELECT
         l.id, l.lat, l.lng, l.price, l.property_type, l.rooms, l.published_at,
         (SELECT ph.price FROM price_history ph
           WHERE ph.listing_id = l.id
           ORDER BY ph.seen_at ASC LIMIT 1) AS first_price
       FROM listings l
       WHERE ${sql}
       LIMIT ?`,
    )
    .all(...params, limit);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return rows.map((row) => ({
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    price: row.price,
    propertyType: row.property_type as PropertyType,
    rooms: row.rooms,
    priceDiff:
      row.price != null && row.first_price != null && row.first_price !== row.price
        ? row.price - row.first_price
        : null,
    isNew: row.published_at != null && Date.parse(row.published_at) > weekAgo,
  }));
}

export function findListingsInBBox(opts: FindOptions): Listing[] {
  const db = getDb();
  const { sql, params } = buildWhere(opts);
  const limit = opts.limit ?? 500;

  const rows = db
    .prepare<unknown[], ListingRow>(
      `SELECT l.* FROM listings l WHERE ${sql} ORDER BY l.published_at DESC LIMIT ?`,
    )
    .all(...params, limit);

  return rows.map(rowToListing);
}

export function getListingsByIds(ids: string[]): Listing[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const rows = db
    .prepare<string[], ListingRow>(
      `SELECT * FROM listings WHERE id IN (${ids.map(() => '?').join(',')}) AND is_active = 1`,
    )
    .all(...ids);
  return rows.map(rowToListing);
}

export function getPriceHistory(listingId: string): { price: number; seenAt: string }[] {
  const db = getDb();
  return db
    .prepare<[string], { price: number; seen_at: string }>(
      'SELECT price, seen_at FROM price_history WHERE listing_id = ? ORDER BY seen_at ASC',
    )
    .all(listingId)
    .map((r) => ({ price: r.price, seenAt: r.seen_at }));
}

export function countListings(): { total: number; active: number; unique: number } {
  const db = getDb();
  const row = db
    .prepare<[], { total: number; active: number; unique: number }>(
      `SELECT COUNT(*) AS total,
              SUM(is_active) AS active,
              SUM(is_active = 1 AND duplicate_of IS NULL) AS "unique"
         FROM listings`,
    )
    .get();
  return { total: row?.total ?? 0, active: row?.active ?? 0, unique: row?.unique ?? 0 };
}

/** Rozpad počtu podľa portálu — na kontrolu, koľko ktorý zdroj reálne pridal. */
export function countBySource(): { source: string; total: number; unique: number }[] {
  const db = getDb();
  return db
    .prepare<[], { source: string; total: number; unique: number }>(
      `SELECT source,
              COUNT(*) AS total,
              SUM(duplicate_of IS NULL) AS "unique"
         FROM listings WHERE is_active = 1
        GROUP BY source ORDER BY total DESC`,
    )
    .all();
}
