import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const yml = readFileSync(new URL('../../../.github/workflows/crawl.yml', import.meta.url), 'utf8');

/** Bez komentárov — inak by kontrolu spustilo aj to, čo je len opísané v poznámke. */
const kod = yml
  .split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n');

/**
 * Rozvrh je v súbore dvakrát: raz ako cron, raz ako reťazec, podľa ktorého
 * sa vyberá zdroj. Keď sa rozídu, nedeľa ticho pozbiera rýchle zdroje a
 * topreality nezbiera nikto — bez chyby, bez mailu, len chýbajúce dáta.
 */
test('týždenný cron a výber topreality sa musia zhodovať znak po znaku', () => {
  const crons = [...yml.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]!);
  const weekly = crons.filter((c) => c.split(' ')[4] !== '*');

  assert.equal(weekly.length, 1, 'čakáme práve jeden týždenný rozvrh');

  const pick = /github\.event\.schedule \}\}" = "([^"]+)" \]; then\s*\n\s*echo "sources=topreality"/.exec(yml);

  assert.ok(pick, 'výber topreality sa v rozvrhu nenašiel');
  assert.equal(pick[1], weekly[0]);
});

/**
 * Kroky, ktoré stavajú a nasadzujú mapu, mali podmienku na prítomnosť tokenu.
 * Znamenalo to, že bez tokenu sa ticho preskočia a beh sa nahlási ako úspešný
 * — mapa by zamrzla a nikto by sa to nedozvedel.
 */
test('chýbajúci token na Vercel musí beh zhodiť, nie ticho preskočiť', () => {
  assert.ok(
    !/if: env\.VERCEL_TOKEN/.test(kod),
    'podmienka na token tlmí poplach — nasadenie sa nesmie ticho preskakovať',
  );
  assert.ok(
    /if \[ -z "\$VERCEL_TOKEN" \]; then[\s\S]*?exit 1/.test(kod),
    'chýba kontrola, ktorá pri prázdnom tokene beh zhodí',
  );
});

/**
 * Repo je verejné kvôli minútam na Actions. Keby sa publikovanie vetvy `data`
 * vrátilo, bol by z nej verejne stiahnuteľný celý dataset — presne to, čomu
 * sme sa chceli vyhnúť. Beh preto nemá do repa čo zapisovať.
 */
test('dataset sa nesmie publikovať do repa', () => {
  assert.ok(!/checkout -q -b data/.test(kod), 'vetva `data` sa nesmie publikovať');
  assert.ok(!/contents: write/.test(kod), 'beh nemá dôvod zapisovať do verejného repa');
});
