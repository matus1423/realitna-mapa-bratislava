import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isDemandTitle,
  isPlausiblePrice,
  isUnavailableTitle,
  parseNumber,
  parseRooms,
  pricePerM2,
} from '../src/index.js';

test('parseNumber: cenu s medzerami a menou prečíta', () => {
  assert.equal(parseNumber('279 000 €'), 279000);
  assert.equal(parseNumber('3 764,67 €/m²'), 3764.67);
  assert.equal(parseNumber('74'), 74);
  assert.equal(parseNumber(null), null);
  assert.equal(parseNumber(''), null);
});

test('parseNumber: nezlomiteľná medzera je tiež medzera', () => {
  // portály ju používajú bežne a obyčajný trim ju nechytí
  assert.equal(parseNumber('1 250 000 €'), 1250000);
});

test('parseNumber: dva údaje v jednom reťazci zlepí — preto ho volať na orezaný vstup', () => {
  // Presne toto pokazilo ceny prenájmov: riadok "1 000 € 100 €" (nájom
  // plus energie) dal 1000100. Test to drží zdokumentované, nech nikoho
  // nenapadne "opraviť" volajúci kód späť.
  assert.equal(parseNumber('1 000 € 100 €'), 1000100);
  assert.equal(parseNumber(/^[\d\s ]+/.exec('1 000 € 100 €')![0]), 1000);
});

test('parseRooms: z kategórie odvodí počet izieb', () => {
  assert.equal(parseRooms('THREE_ROOM_APARTMENT'), 3);
  assert.equal(parseRooms('GARSONKA'), 1);
  assert.equal(parseRooms('FIVE_AND_MORE_ROOM_APARTMENT'), 5);
  assert.equal(parseRooms(null), null);
});

test('pricePerM2: nedelí nulou', () => {
  assert.equal(pricePerM2(300000, 75), 4000);
  assert.equal(pricePerM2(300000, 0), null);
  assert.equal(pricePerM2(null, 75), null);
});

test('isUnavailableTitle: chytí rezervované a predané v akomkoľvek tvare', () => {
  const cases = [
    'REZERVOVANÉ: Nadčasový 2-izbový byt na Ďumbierskej',
    'SVOBODA & WILLIAMS | REZERVOVANÉ | 112028 | Elegantný byt',
    'REZERVOVANE! 360° 3D 3 IZBOVÝ byt Podunajské Biskupice',
    '**REZERVOVANÝ** Priestranný klimatizovaný 2i byt',
    '[REZERVOVANÉ!] ASTER Predaj: ZREKONŠTRUOVANÝ 3i byt',
    '=PREDANÉ=Charizmatický staromestský byt 216 m2',
    'RENATAS  | PREDANÝ | 2-IZBOVÝ BYT RUŽINOVSKÁ',
    'BA III. Kramáre - 2 izbový byt s veľkou terasou REZERVOVANE',
  ];
  for (const title of cases) {
    assert.equal(isUnavailableTitle(title, 'predaj'), true, title);
  }
});

test('isUnajateľné: "prenajatý" pri predaji je obsadený byt, nie stiahnutý inzerát', () => {
  // Investičná ponuka s nájomníkom je úplne legitímna a na mape patrí.
  const tenanted = 'Investičný 4-izbový byt Dunajská 15, 136 m², dlhodobo prenajatý';
  assert.equal(isUnavailableTitle(tenanted, 'predaj'), false);
  assert.equal(
    isUnavailableTitle('1 izbový byt na predaj, prenajatý zisk 450€/mesiac', 'predaj'),
    false,
  );

  // Pri prenájme to naopak znamená, že je fuč.
  assert.equal(isUnavailableTitle('Už prenajaté! Na prenájom 2 izbový byt', 'prenajom'), true);
});

test('isUnavailableTitle: bežný inzerát nechá na pokoji', () => {
  assert.equal(isUnavailableTitle('3 izbový byt na predaj, Palisády', 'predaj'), false);
  assert.equal(isUnavailableTitle('Na prenájom 2i byt v Ružinove', 'prenajom'), false);
});

test('isDemandTitle: dopyt nie je ponuka', () => {
  // Realitky inzerujú aj "Hľadáme pre klienta byt do 450 000 €" a portál to
  // zaradí medzi predaje aj s cenou — na mape sa to tvári ako byt na predaj.
  const dopyty = [
    'Hľadám 2-3 izbový byt na kúpu v Starom meste',
    'Hľadáme 3–4 izbový byt v Rači alebo Krasňanoch (80 m²+, do 450 000 €)',
    'Kúpim 1 izbový byt v Petržalke',
    'Výmena 1,5 izbového bytu za 3 izbový - Račianske mýto',
  ];
  for (const t of dopyty) assert.equal(isDemandTitle(t), true, t);
});

test('isDemandTitle: ponuku s podobným slovom nechá tak', () => {
  assert.equal(isDemandTitle('3 izbový byt na predaj, Palisády'), false);
  assert.equal(isDemandTitle('Byt, ktorý hľadáte, je tu'), false, 'sloveso nie je na začiatku');
});

/**
 * Jedna spoločná hranica 1000 € dávala zmysel len pri predaji a ticho
 * zhodila z mapy 55 % prenájmov — nájom za 800 € je v Bratislave bežný.
 */
test('isPlausiblePrice: nájom za 800 € je bežný, byt za 800 € je chyba zdroja', () => {
  assert.equal(isPlausiblePrice(800, 'prenajom'), true);
  assert.equal(isPlausiblePrice(800, 'predaj'), false);
});

test('isPlausiblePrice: chýbajúca cena je "dohodou", nie chyba', () => {
  assert.equal(isPlausiblePrice(null, 'predaj'), true);
  assert.equal(isPlausiblePrice(null, 'prenajom'), true);
});

test('isPlausiblePrice: zástupné nuly a nezmyselné výšky vypadnú', () => {
  assert.equal(isPlausiblePrice(0, 'prenajom'), false, 'cena na vyžiadanie');
  assert.equal(isPlausiblePrice(1, 'predaj'), false);
  assert.equal(isPlausiblePrice(60_000, 'prenajom'), false, 'to už je predajná cena');
  assert.equal(isPlausiblePrice(250_000, 'predaj'), true);
});
