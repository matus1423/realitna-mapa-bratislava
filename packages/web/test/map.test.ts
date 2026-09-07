import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePolygon, encodePolygon, isInside, type Point } from '../src/map/polygon.js';
import { compactPrice, daysOnMarket, priceRatioLabel, yieldTone } from '../src/format.js';
import { groupByCoordinate } from '../src/map/grouping.js';
import { applyFilters, RATIO_OPTIONS } from '../src/map/filter.js';
import type { MapState } from '../src/state/useUrlState.js';

const STARE_MESTO: Point[] = [
  [48.155, 17.100], [48.155, 17.125], [48.140, 17.125], [48.140, 17.100],
];

test('bod vnútri a mimo vyznačenej oblasti', () => {
  assert.equal(isInside([48.148, 17.112], STARE_MESTO), true);
  assert.equal(isInside([48.200, 17.112], STARE_MESTO), false, 'severne od oblasti');
  assert.equal(isInside([48.148, 17.300], STARE_MESTO), false, 'východne od oblasti');
});

test('menej než tri body nie je plocha — nefiltruje sa', () => {
  assert.equal(isInside([48.9, 18.9], [[48.1, 17.1], [48.2, 17.2]]), true);
});

test('oblasť prežije cestu do URL a späť', () => {
  const decoded = decodePolygon(encodePolygon(STARE_MESTO));
  assert.equal(decoded.length, 4);
  assert.equal(decoded[0]![0], 48.155);
});

test('nezmyselný parameter v URL oblasť nevyrobí', () => {
  assert.deepEqual(decodePolygon('smäti'), []);
  assert.deepEqual(decodePolygon(null), []);
  assert.deepEqual(decodePolygon('48.1,17.1;48.2,17.2'), [], 'dva body nestačia');
});

test('inzeráty na tej istej súradnici sa zlúčia do jedného markera', () => {
  // Zdroj dáva stred ulice s presnosťou 200 m, takže kolízie sú bežné.
  // Bez zlúčenia by sa markery prekrývali a spodné by sa nedali kliknúť.
  const marker = (id: string, price: number, lat = 48.15) => ({
    id, lat, lng: 17.11, price, propertyType: 'byt' as const, rooms: 2,
    priceDiff: null, isNew: false, imprecise: false, priceRatio: null,
  });

  const groups = groupByCoordinate([
    marker('a', 300_000), marker('b', 250_000), marker('c', 400_000, 48.20),
  ]);

  assert.equal(groups.length, 2);
  const spolu = groups.find((g) => g.count === 2)!;
  assert.equal(spolu.price, 250_000, 'na pilulke je cena najlacnejšieho');
  assert.deepEqual(spolu.ids.sort(), ['a', 'b']);
});

test('skrátená cena', () => {
  assert.equal(compactPrice(481_000), '€481K');
  assert.equal(compactPrice(1_250_000), '€1,25M');
  assert.equal(compactPrice(null), '—');
});

test('pomer k okoliu slovom', () => {
  assert.equal(priceRatioLabel(0.76)!.text, 'o 24 % lacnejší než okolie');
  assert.equal(priceRatioLabel(0.76)!.tone, 'good');
  assert.equal(priceRatioLabel(1.24)!.tone, 'bad');
  // rozdiely pod 5 % sú pri mediáne z pár desiatok bytov predstieraná presnosť
  assert.equal(priceRatioLabel(1.02)!.tone, 'neutral');
  assert.equal(priceRatioLabel(null), null);
});

test('pásmo výnosu je postavené na bratislavskom priemere okolo 4 %', () => {
  assert.equal(yieldTone(0.062), 'good');
  assert.equal(yieldTone(0.042), 'neutral');
  assert.equal(yieldTone(0.024), 'bad');
});

test('dĺžka v ponuke: dátum z portálu je presný, prvé videnie len približné', () => {
  const pred30dnami = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const zPortalu = daysOnMarket(pred30dnami, new Date().toISOString())!;
  assert.equal(zPortalu.days, 30);
  assert.equal(zPortalu.exact, true);

  const zPrvehoVidenia = daysOnMarket(null, pred30dnami)!;
  assert.equal(zPrvehoVidenia.exact, false);
});

const STAV: MapState = {
  lat: 48.15, lon: 17.11, zoom: 13,
  dealType: 'predaj', propertyTypes: ['byt'], rooms: [], polygon: [],
};

let m = 0;
function marker(priceRatio: number | null, over: Record<string, unknown> = {}) {
  m += 1;
  return {
    id: `m${m}`, lat: 48.15, lng: 17.11, price: 300_000,
    propertyType: 'byt' as const, rooms: 3,
    priceDiff: null, isNew: false, imprecise: false, priceRatio,
    ...over,
  };
}

test('filter podľa okolia: nechá len byty dosť pod mediánom', () => {
  const markers = [marker(0.75), marker(0.88), marker(1.0), marker(1.3)];
  const found = applyFilters(markers, { ...STAV, maxPriceRatio: 0.9 }, true);

  assert.deepEqual(found.map((x) => x.priceRatio), [0.75, 0.88]);
});

/**
 * Byt bez indexu nemá s čím porovnávať — susedov v okolí je málo. Keď sa
 * niekto pýta na výhodné ceny, "nevieme" nie je odpoveď, ktorú chce na mape.
 */
test('filter podľa okolia: byt bez indexu sa medzi výhodné nezaráta', () => {
  const found = applyFilters([marker(null), marker(0.7)], { ...STAV, maxPriceRatio: 0.9 }, true);

  assert.equal(found.length, 1);
  assert.equal(found[0]?.priceRatio, 0.7);
});

test('filter podľa okolia: bez zapnutého filtra ostávajú aj byty bez indexu', () => {
  const found = applyFilters([marker(null), marker(1.4)], STAV, true);
  assert.equal(found.length, 2);
});

/**
 * Pomer je priamo v markeri, takže ho vieme použiť aj na dátach z API,
 * kde ostatné filtre rieši server.
 */
test('filter podľa okolia: platí aj v režime s API', () => {
  const found = applyFilters([marker(0.6), marker(1.2)], { ...STAV, maxPriceRatio: 0.8 }, false);
  assert.equal(found.length, 1);
});

test('filter podľa okolia: prahy sú zoradené od najmiernejšieho', () => {
  const values = RATIO_OPTIONS.map((o) => o.value);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
  assert.ok(values.every((v) => v < 1), 'každý prah musí byť pod úrovňou okolia');
});
