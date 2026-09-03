import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldDeactivate } from '../src/deactivation.js';

const zdravyBeh = { collected: 3400, limit: 20000, fetched: 300, failed: 0, inDb: 3400 };

test('úplný beh smie zhasnúť zmiznuté inzeráty', () => {
  assert.equal(shouldDeactivate(zdravyBeh).deactivate, true);
});

test('pokazené stránkovanie nesmie vymazať zdroj', () => {
  // Presne toto sa stalo: /predam2.html vracalo znova prvú stranu, zber
  // skončil na 16 odkazoch a zhaslo 795 platných bytov.
  const verdict = shouldDeactivate({ ...zdravyBeh, collected: 16, fetched: 16 });
  assert.equal(verdict.deactivate, false);
  assert.match(verdict.reason, /16 odkazov.*3400/);
});

test('beh obmedzený limitom neprešiel celý zdroj', () => {
  assert.equal(shouldDeactivate({ ...zdravyBeh, collected: 100, limit: 100 }).deactivate, false);
});

test('priveľa chýb znamená, že sme portál možno len nahnevali', () => {
  // Raz nám nehnutelnosti vrátilo 99 chýb zo 139 — dáta boli v poriadku,
  // len sme sa k nim nedostali.
  const verdict = shouldDeactivate({ ...zdravyBeh, fetched: 139, failed: 99 });
  assert.equal(verdict.deactivate, false);
  assert.match(verdict.reason, /priveľa chýb/);
});

test('jedna chyba v malom behu stačí na opatrnosť', () => {
  assert.equal(shouldDeactivate({ ...zdravyBeh, fetched: 5, failed: 1 }).deactivate, false);
});

test('prvý beh nad prázdnou databázou zhasínať smie', () => {
  assert.equal(shouldDeactivate({ ...zdravyBeh, collected: 10, inDb: 0 }).deactivate, true);
});
