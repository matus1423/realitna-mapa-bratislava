import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowed, parseRobots } from '../src/robots.js';

const ZOZNAMREALIT = `
User-agent: *
Allow: /
Disallow: /*sledovat=
Disallow: /pdf*
`;

const NEHNUTELNOSTI = `
User-Agent: *
Disallow: /api/
Disallow: /profil/*
Disallow: *?order=NEWEST*
`;

const TOPREALITY = `
User-agent: *
Disallow: /admin
Request-rate: 10/1m
`;

test('zoznamrealit: /pdf-* je zakázané', () => {
  // Toto sme raz porušili — parser zbieral zo zoznamu odkazy na PDF export
  // inzerátu a stiahlo sa cez ne ~150 requestov.
  const rules = parseRobots(ZOZNAMREALIT);
  assert.equal(isAllowed(rules, 'https://www.zoznamrealit.sk/pdf-nejaky-byt-998306'), false);
  assert.equal(isAllowed(rules, 'https://www.zoznamrealit.sk/nejaky-byt-998306'), true);
  assert.equal(isAllowed(rules, 'https://www.zoznamrealit.sk/predaj/byty/bratislava'), true);
});

test('nehnutelnosti: /api/ a zoradené výsledky sú zakázané, detaily nie', () => {
  const rules = parseRobots(NEHNUTELNOSTI);
  assert.equal(isAllowed(rules, 'https://www.nehnutelnosti.sk/api/ads'), false);
  assert.equal(isAllowed(rules, 'https://www.nehnutelnosti.sk/profil/niekto'), false);
  assert.equal(isAllowed(rules, 'https://www.nehnutelnosti.sk/vysledky/byty?order=NEWEST'), false);
  assert.equal(isAllowed(rules, 'https://www.nehnutelnosti.sk/detail/Ju123/nejaky-byt'), true);
});

test('Request-rate sa prepočíta na pauzu medzi requestmi', () => {
  // 10 requestov za minútu = 6 sekúnd. Keby sme to čítali zle, búchali by sme
  // do topreality rýchlejšie, než si pýtajú.
  assert.equal(parseRobots(TOPREALITY).crawlDelayMs, 6000);
});

test('Crawl-delay v sekundách', () => {
  assert.equal(parseRobots('User-agent: *\nCrawl-delay: 2').crawlDelayMs, 2000);
});

test('pravidlá pre iné roboty nás nezaujímajú', () => {
  const rules = parseRobots(`
User-agent: *
Disallow: /sukromne/

User-agent: SemrushBot
Disallow: /
`);
  assert.equal(isAllowed(rules, 'https://priklad.sk/verejne'), true);
  assert.equal(isAllowed(rules, 'https://priklad.sk/sukromne/x'), false);
});

test('presnejšie Allow prebije Disallow', () => {
  const rules = parseRobots('User-agent: *\nDisallow: /a/\nAllow: /a/b/');
  assert.equal(isAllowed(rules, 'https://priklad.sk/a/x'), false);
  assert.equal(isAllowed(rules, 'https://priklad.sk/a/b/x'), true);
});
