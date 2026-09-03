import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodePolygon, encodePolygon, isInside, type Point } from '../src/map/polygon.js';
import { compactPrice, daysOnMarket, priceRatioLabel, yieldTone } from '../src/format.js';
import { groupByCoordinate } from '../src/map/grouping.js';

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
