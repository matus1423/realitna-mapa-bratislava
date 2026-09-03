import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// DB_PATH musí byť nastavené skôr, než sa načíta @rmb/db
process.env['DB_PATH'] = join(mkdtempSync(join(tmpdir(), 'rmb-')), 'test.db');

const { getDb, upsertListing, findMarkersInBBox, countListings } = await import('@rmb/db');
const { Grid, median } = await import('../src/grid.js');
const { computePriceIndex } = await import('../src/price-index.js');
const { computeRentalYield } = await import('../src/rental-yield.js');
const { dedupe } = await import('../src/dedupe.js');

let n = 0;
function byt(over: Record<string, unknown> = {}) {
  n += 1;
  const price = (over['price'] as number | undefined) ?? 300_000;
  const areaM2 = (over['areaM2'] as number | undefined) ?? 75;
  return {
    id: `test:${n}`, source: 'nehnutelnosti' as const, sourceId: String(n),
    sourceUrl: `https://priklad.sk/${n}`, dealType: 'predaj' as const, propertyType: 'byt' as const,
    price, priceCurrency: 'EUR', pricePerM2: price / areaM2,
    lat: 48.15, lng: 17.11, locationRadius: 200,
    address: 'Testovacia', street: null, city: 'Bratislava', district: null,
    areaM2, landAreaM2: null, rooms: 3, roomsRaw: null, floor: null,
    condition: null, hasElevator: null, title: 'Pekný byt', description: null,
    imageUrls: [], advertiserName: null, advertiserType: null,
    publishedAt: null, firstSeenAt: new Date().toISOString(),
    scrapedAt: new Date().toISOString(),
    ...over,
  };
}

test('median: párny aj nepárny počet', () => {
  assert.equal(median([1, 2, 3]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('Grid: medián z okolia, a nič keď je vzoriek málo', () => {
  const grid = new Grid();
  // osem je minimum, pri menej vzorkách by medián predstieral presnosť
  for (let i = 0; i < 7; i++) grid.add(48.15, 17.11, 1000);
  assert.equal(grid.medianAround(48.15, 17.11), null, '7 vzoriek nestačí');

  grid.add(48.15, 17.11, 1000);
  assert.equal(grid.medianAround(48.15, 17.11), 1000, '8 už áno');
});

test('Grid: vzdialený bod do okolia nepatrí', () => {
  const grid = new Grid();
  for (let i = 0; i < 10; i++) grid.add(48.15, 17.11, 5000);
  assert.equal(grid.medianAround(48.60, 17.90), null);
});

test('index cien: pomer k okoliu a odolnosť voči výstrelku', () => {
  const db = getDb();
  db.exec('DELETE FROM listings; DELETE FROM price_history');

  // desať bytov po 4000 €/m² a jeden penthouse za 40 000 €/m²
  for (let i = 0; i < 10; i++) upsertListing(byt({ price: 300_000, areaM2: 75 }));
  upsertListing(byt({ price: 3_000_000, areaM2: 75 }));

  const result = computePriceIndex();
  assert.ok(result.computed > 0);

  const row = db.prepare<[], { area_price_per_m2: number; price_ratio: number }>(
    "SELECT area_price_per_m2, price_ratio FROM listings WHERE price = 300000 LIMIT 1",
  ).get()!;

  // priemer by okolie vytiahol na ~7300 a bežný byt by vyzeral ako výhodná
  // kúpa; medián drží 4000
  assert.equal(row.area_price_per_m2, 4000);
  assert.equal(row.price_ratio, 1);
});

test('výnos: ročný nájom delený cenou, a nič bez prenájmov v okolí', () => {
  const db = getDb();
  db.exec('DELETE FROM listings; DELETE FROM price_history');

  for (let i = 0; i < 10; i++) upsertListing(byt({ price: 300_000, areaM2: 75 }));
  assert.equal(computeRentalYield().computed, 0, 'bez prenájmov niet z čoho počítať');

  // desať prenájmov po 20 €/m² → odhad nájmu 1500 €, výnos 6 %
  for (let i = 0; i < 10; i++) {
    upsertListing(byt({ dealType: 'prenajom', price: 1500, areaM2: 75 }));
  }
  computeRentalYield();

  const row = db.prepare<[], { estimated_rent: number; gross_yield: number }>(
    "SELECT estimated_rent, gross_yield FROM listings WHERE deal_type='predaj' LIMIT 1",
  ).get()!;
  assert.equal(row.estimated_rent, 1500);
  assert.equal(row.gross_yield, 0.06);
});

test('deduplikácia: rovnaká poloha, plocha a cena znamenajú jeden byt na mape', () => {
  const db = getDb();
  db.exec('DELETE FROM listings; DELETE FROM price_history');

  upsertListing(byt({ price: 300_000, areaM2: 75 }));
  upsertListing(byt({ price: 300_000, areaM2: 75, source: 'topreality' }));
  upsertListing(byt({ price: 450_000, areaM2: 90 }));

  const result = dedupe();
  assert.equal(result.marked, 1);
  assert.equal(countListings().unique, 2);
});

test('predané a rezervované sa na mapu nedostanú', () => {
  const db = getDb();
  db.exec('DELETE FROM listings; DELETE FROM price_history');

  upsertListing(byt({ title: 'Slnečný 3 izbový byt' }));
  upsertListing(byt({ title: 'REZERVOVANÉ | Slnečný 3 izbový byt' }));

  const markers = findMarkersInBBox({
    bbox: { latMin: 48, latMax: 48.3, lngMin: 17, lngMax: 17.3 },
  });
  assert.equal(markers.length, 1);
});

test('cena pod 1000 € je chyba zdroja, nie byt za pár stoviek', () => {
  const db = getDb();
  db.exec('DELETE FROM listings; DELETE FROM price_history');

  upsertListing(byt({ price: 0 }));
  upsertListing(byt({ price: 250_000 }));

  const markers = findMarkersInBBox({
    bbox: { latMin: 48, latMax: 48.3, lngMin: 17, lngMax: 17.3 },
  });
  assert.equal(markers.length, 1);
  assert.equal(markers[0]!.price, 250_000);
});

test('cenová história zaznamená len zmenu, nie každý beh', () => {
  const db = getDb();
  db.exec('DELETE FROM listings; DELETE FROM price_history');

  const listing = byt({ price: 300_000 });
  upsertListing(listing);
  upsertListing({ ...listing, scrapedAt: new Date(Date.now() + 1000).toISOString() });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM price_history').get<{ c: number }>()!.c, 1);

  upsertListing({ ...listing, price: 280_000, scrapedAt: new Date(Date.now() + 2000).toISOString() });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM price_history').get<{ c: number }>()!.c, 2);
});
