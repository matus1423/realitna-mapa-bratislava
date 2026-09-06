import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// DB_PATH musí byť nastavené skôr, než sa načíta @rmb/db
process.env['DB_PATH'] = join(mkdtempSync(join(tmpdir(), 'rmb-health-')), 'test.db');

const { getDb, upsertListing, refreshUnavailableFlags, countListings } = await import('@rmb/db');
const { healthCheck } = await import('../src/health-check.js');
const { computePriceIndex } = await import('../src/price-index.js');

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

function reset(): void {
  getDb().exec('DELETE FROM listings; DELETE FROM price_history');
}

/**
 * Presne tá situácia, ktorá stopla nasadenie na štyri dni: inzerát sa dostal
 * do databázy ešte pred sprísnením pravidla a odvtedy sa mu detail nesťahuje,
 * takže sám od seba by sa už neprehodnotil nikdy.
 */
test('prepočet dostupnosti: skryje dopyt uložený pred sprísnením pravidla', () => {
  reset();
  upsertListing(byt({ title: 'Pekný byt' }));

  // obídeme upsert — simulujeme riadok, ktorý do databázy pritiekol vtedy,
  // keď sa dopyty ešte nefiltrovali
  const db = getDb();
  db.prepare("UPDATE listings SET title = 'Hľadám 2-izbový byt pre klienta', is_unavailable = 0")
    .run();

  assert.equal(countListings().unique, 1, 'dopyt je zatiaľ na mape');

  const changed = refreshUnavailableFlags();
  assert.equal(changed, 1);
  assert.equal(countListings().unique, 0, 'po prepočte je dopyt z mapy preč');
});

test('prepočet dostupnosti: platný byt nechá na pokoji a nehlási zmenu', () => {
  reset();
  upsertListing(byt({ title: '3-izbový byt s balkónom' }));

  assert.equal(refreshUnavailableFlags(), 0, 'nemá čo meniť');
  assert.equal(countListings().unique, 1);
});

test('prepočet dostupnosti: vráti rezervovaný byt späť, keď z názvu zmizne', () => {
  reset();
  upsertListing(byt({ title: 'REZERVOVANÉ 3-izbový byt' }));
  assert.equal(countListings().unique, 0);

  getDb().prepare("UPDATE listings SET title = '3-izbový byt'").run();
  assert.equal(refreshUnavailableFlags(), 1);
  assert.equal(countListings().unique, 1, 'po zrušení rezervácie sa vráti na mapu');
});

test('kontrola dát: dopyt je upozornenie, nie dôvod nenasadiť', () => {
  reset();
  for (let i = 0; i < 600; i++) upsertListing(byt());
  computePriceIndex();

  // dopyt, ktorý prepočet ešte nechytil — kontrola ho má nájsť, ale nezhodiť beh
  getDb()
    .prepare("UPDATE listings SET title = 'Hľadám byt', is_unavailable = 0 WHERE rowid = 1")
    .run();

  const { problems, warnings } = healthCheck();
  assert.equal(problems.length, 0, 'nasadeniu nič nebráni');
  assert.ok(
    warnings.some((w) => w.includes('dopytov')),
    'ale je to vidieť medzi upozorneniami',
  );
});

test('kontrola dát: prázdna mapa nasadenie zastaví', () => {
  reset();
  for (let i = 0; i < 10; i++) upsertListing(byt());

  const { problems } = healthCheck();
  assert.ok(
    problems.some((p) => p.includes('zber zjavne zlyhal')),
    'desať inzerátov znamená rozbitý zber',
  );
});

test('kontrola dát: rozsypané ceny nasadenie zastavia', () => {
  reset();
  for (let i = 0; i < 600; i++) upsertListing(byt());
  // desatina predajov zrazu v cenách nájmu = rozbitý parser ceny
  getDb().prepare('UPDATE listings SET price = 850 WHERE rowid % 10 = 0').run();

  const { problems } = healthCheck();
  assert.ok(
    problems.some((p) => p.includes('v rozsahu nájmu')),
    'takéto dáta sa nasadiť nemajú',
  );
});
