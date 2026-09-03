import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jsonLd, labelValue, textLines } from '../src/sources/html.js';
import { extractFlightPayload, extractObject, nehnutelnostiSource } from '../src/sources/nehnutelnosti.js';
import { bazosSource } from '../src/sources/bazos.js';
import { toprealitySource } from '../src/sources/topreality.js';
import { zoznamrealitSource } from '../src/sources/zoznamrealit.js';

test('nehnutelnosti: dáta sú v RSC payloade rozsekanom do push volaní', () => {
  const ad = { id: 'Ju1', location: { point: { latitude: '48.15', longitude: '17.11' } } };
  const chunk = JSON.stringify(`{"advertisement":${JSON.stringify(ad)}}`);
  const html = `<script>self.__next_f.push([1,${chunk}])</script>`;

  const payload = extractFlightPayload(html);
  assert.equal(extractObject(payload, 'advertisement')?.['id'], 'Ju1');
});

test('nehnutelnosti: payload je prúd hodnôt, nie jeden JSON — vyrezáva sa párovaním zátvoriek', () => {
  const payload = 'smäti{"advertisement":{"id":"Ju2","nested":{"a":"}"}},"iné":1}';
  const ad = extractObject(payload, 'advertisement') as Record<string, unknown>;
  assert.equal(ad['id'], 'Ju2');
});

test('nehnutelnosti: strana bez nového odkazu nesmie zastaviť zber', () => {
  // Portál opakuje topované inzeráty naprieč stranami. Keď sme sa spoliehali
  // len na "žiadny nový odkaz", zber skončil po ~75 % každého okresu.
  const html = '<a href="/detail/JuA/byt-a">x</a><a href="/detail/JuB/byt-b">y</a>';
  const result = nehnutelnostiSource.parseListPage(html, '');
  assert.equal(result.detailUrls.length, 2);
  assert.equal(result.itemsOnPage, 2, 'itemsOnPage musí hlásiť počet odkazov na strane');
});

test('topreality: cena sa berie z prvého čísla riadku', () => {
  // "1 000 € 100 €" je nájom plus energie; bez orezania z toho vyjde 1000100.
  const lines = ['Cena', '1 000 € 100 €', 'Lokalita', 'Bratislava II'];
  const raw = labelValue(lines, 'Cena', 1);
  assert.equal(raw, '1 000 € 100 €');
  assert.equal(Number(/^[\d\s ]+/.exec(raw!)![0].replace(/[\s ]/g, '')), 1000);
});

test('topreality: stránkovanie je /predam/2.html so lomkou', () => {
  // Bez lomky portál vráti znova prvú stranu a zber sa zastaví na 16 inzerátoch.
  assert.match(toprealitySource.listUrl(0, 1), /\/bratislava\/byty\/predam$/);
  assert.match(toprealitySource.listUrl(0, 2), /\/bratislava\/byty\/predam\/2\.html$/);
});

test('bazos: stránkuje sa posunom po dvadsiatich', () => {
  assert.match(bazosSource.listUrl(0, 1), /\/predam\/byt\/$/);
  assert.match(bazosSource.listUrl(0, 2), /\/predam\/byt\/20\/$/);
  assert.match(bazosSource.listUrl(0, 4), /\/predam\/byt\/60\/$/);
});

test('bazos: strana bez bratislavského inzerátu nie je prázdna strana', () => {
  // Zoznam je celoslovenský. Keď sme nulu zhôd čítali ako koniec, vyzbieralo
  // sa 3 inzeráty namiesto 244.
  const html = `
    <a href="/inzerat/111/byt-kosice.php">Byt Košice</a> Obec: Košice-Juh
    <a href="/inzerat/222/byt-nitra.php">Byt Nitra</a> Obec: Nitra`;
  const result = bazosSource.parseListPage(html, '');
  assert.equal(result.detailUrls.length, 0, 'žiadny bratislavský inzerát');
  assert.equal(result.itemsOnPage, 2, 'ale strana inzeráty mala');
});

test('bazos: PSČ a mesto sú v dvoch riadkoch', () => {
  const lines = ['Lokalita:', '821 04', 'Bratislava', 'Videlo:', '231 ľudí'];
  assert.equal(labelValue(lines, 'Lokalita', 2), '821 04 Bratislava');
  assert.equal(labelValue(lines, 'Lokalita', 1), '821 04', 'jeden riadok nestačí');
});

test('zoznamrealit: /pdf- odkazy sa nezbierajú', () => {
  const html = `
    <a href="/pdf-nejaky-byt-998306">PDF</a>
    <a href="/nejaky-byt-998306">Inzerát</a>`;
  const result = zoznamrealitSource.parseListPage(html, '');
  assert.deepEqual(result.detailUrls, ['https://www.zoznamrealit.sk/nejaky-byt-998306']);
});

test('zoznamrealit: JSON-LD s doslovnými koncami riadkov sa dá prečítať', () => {
  // Ich popisy obsahujú nezaescapované konce riadkov, čo je neplatný JSON.
  // Bez druhého priechodu vypadnú fotky aj názov.
  const html = `<script type="application/ld+json">
  {"@type": "Product", "name": "Byt\nna Znievskej", "image": ["a.jpg"]}
  </script>`;
  const blocks = jsonLd(html);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0]!['name'], 'Byt\nna Znievskej');
});

test('textLines: zahodí skripty a poskladá čitateľné riadky', () => {
  const html = '<script>var x = "Cena";</script><div>Cena</div><span>100 €</span>';
  assert.deepEqual(textLines(html), ['Cena', '100 €']);
});
