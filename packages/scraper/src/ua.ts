/**
 * Jedna identita pre celý scraper. Vlastný súbor preto, aby si ju mohli
 * načítať `http.ts` aj `robots.ts` bez toho, aby na seba museli navzájom
 * importovať a vznikol cyklus.
 */
export const USER_AGENT =
  'realitna-mapa-bratislava/0.1 (osobný prototyp; kontakt: matus.mader00@gmail.com)';
